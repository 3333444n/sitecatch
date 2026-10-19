/**
 * The background save pipeline (see docs/architecture.md#save-pipeline).
 *
 *   1. auth + preset → fresh schema (forced) → validatePreset (blocking → preset-invalid)
 *   2. normalize the URL written to the dedupe property
 *   3. screenshot needed? → upload once (recompress to fit the workspace limit);
 *      too large → continue without it (warning)
 *   4. build properties + extras → createPage (create/duplicate) or updatePage (update, no children)
 *   5. ambiguous create failure → committed id (client) / re-run dup check / error `retry`
 *   6. job done + history + lastPresetId + badge
 *
 * All side effects are injected (`SavePipelineDeps`) so the ordering is unit-testable.
 * Never throws; never logs the token.
 */
import type { CompressedImage, CompressOptions } from '@/lib/capture/image';
import { dataUrlToBlob } from '@/lib/capture/image';
import { err, ok, toAppError, type AppError, type Result } from '@/lib/errors';
import type { JobState, SaveMode } from '@/lib/messaging/protocol';
import type { NotionClient } from '@/lib/notion/client';
import type {
  DataSourceSchema,
  NotionCreatePageBody,
  NotionPageRef,
  NotionPropertyValue,
  NotionUpdatePageBody,
} from '@/lib/notion/types';
import { buildPageExtras, buildProperties, DEFAULT_SCREENSHOT_NAME } from '@/lib/properties/build';
import type { FormValues, Preset } from '@/lib/presets/types';
import { isDedupeCapable, validatePreset } from '@/lib/presets/validate';
import type { CaptureResult } from '@/lib/extract/types';
import type { AuthState, HistoryEntry } from '@/lib/storage/items';
import { normalizeUrl, urlVariants } from '@/lib/url/normalize';
import type { Badge } from './badge';
import type { AuthedClient } from './context';

/** Free-plan per-file limit, used when Notion didn't report `workspace_limits`. */
export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Wait before re-querying after an ambiguous create (lets Notion index the page). */
export const RECOVERY_DELAY_MS = 1500;
/**
 * A page counts as "just created by us" when edited no earlier than this
 * before the job started. Notion rounds `last_edited_time` down to the minute.
 */
export const RECOVERY_SKEW_MS = 2 * 60 * 1000;

export interface SaveRequest {
  presetId: string;
  values: FormValues;
  capture: CaptureResult;
  mode: SaveMode;
}

export interface SavePipelineDeps {
  requireClient: () => Promise<Result<AuthedClient>>;
  loadPreset: (id: string) => Promise<Result<Preset>>;
  /** Fresh schema (bypassing the cache, refreshing it). */
  fetchSchema: (client: NotionClient, dataSourceId: string) => Promise<Result<DataSourceSchema>>;
  updateJob: (id: string, patch: Partial<Omit<JobState, 'id' | 'startedAt'>>) => Promise<unknown>;
  addHistory: (entry: HistoryEntry) => Promise<unknown>;
  setLastPresetId: (id: string) => Promise<void>;
  compress: (dataUrl: string, options: CompressOptions) => Promise<Result<CompressedImage>>;
  badge: Badge;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export interface SaveSuccess {
  page: NotionPageRef;
  warnings: string[];
  /** True when the page was found after an ambiguous create failure. */
  recovered: boolean;
}

function presetInvalidError(preset: Preset, details: string[]): AppError {
  return {
    code: 'preset-invalid',
    message: `Your Notion database changed, so the preset “${preset.name}” needs fixing before you can save: ${details.join(' ')}`,
    action: 'edit-preset',
    detail: details.join('\n'),
  };
}

/** Whether any part of the preset (or a files form value) wants the uploaded screenshot. */
export function needsScreenshot(preset: Preset, values: FormValues): boolean {
  if (preset.screenshot.filesPropertyId !== null) return true;
  if (preset.cover === 'screenshot') return true;
  if (preset.screenshot.bodyImage) return true;
  return Object.values(values).some(
    (v) => v.kind === 'files' && v.value.some((ref) => ref.kind === 'screenshot'),
  );
}

/**
 * Copy of `values` with the dedupe property's URL normalized; also returns that URL.
 * When `schema` is given and the dedupe property is missing or has an unusable
 * type, dedupe is off: values are left alone and `dedupeUrl` is null.
 */
export function normalizeDedupeValue(
  preset: Preset,
  values: FormValues,
  schema?: DataSourceSchema,
): { values: FormValues; dedupeUrl: string | null } {
  const id = preset.dedupe.propertyId;
  if (id === null) return { values, dedupeUrl: null };
  if (schema && !isDedupeCapable(schema, id)) return { values, dedupeUrl: null };
  const value = values[id];
  if (value?.kind !== 'text' || value.value.trim() === '') return { values, dedupeUrl: null };
  const normalized = normalizeUrl(value.value);
  return { values: { ...values, [id]: { kind: 'text', value: normalized } }, dedupeUrl: normalized };
}

function titleOf(properties: Record<string, NotionPropertyValue>, schema: DataSourceSchema): string {
  const title = properties[schema.titlePropertyId];
  if (title && 'title' in title) return title.title.map((t) => t.text.content).join('').trim();
  return '';
}

type DedupeQueryType = 'url' | 'rich_text' | 'title';

function dedupeQueryType(schema: DataSourceSchema, propertyId: string): DedupeQueryType | null {
  const type = schema.properties[propertyId]?.type;
  return type === 'url' || type === 'rich_text' || type === 'title' ? type : null;
}

interface UploadOutcome {
  uploadId?: string;
  warnings: string[];
  error?: AppError;
}

async function uploadScreenshot(
  client: NotionClient,
  auth: AuthState,
  capture: CaptureResult,
  deps: SavePipelineDeps,
): Promise<UploadOutcome> {
  const shot = capture.values.screenshot;
  const dataUrl = shot?.kind === 'image' ? shot.dataUrl : undefined;
  if (!dataUrl) {
    return { warnings: ['Saved without screenshot: there was no screenshot to attach.'] };
  }
  const limit = auth.maxFileUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  let blob = dataUrlToBlob(dataUrl);
  if (blob === null) {
    return { warnings: ['Saved without screenshot: the screenshot couldn’t be read.'] };
  }
  if (blob.size > limit) {
    const compressed = await deps.compress(dataUrl, { maxBytes: limit });
    if (!compressed.ok) {
      return {
        warnings: [
          'Saved without screenshot: too large for your Notion workspace even after compression.',
        ],
      };
    }
    blob = compressed.data.blob;
  }
  const contentType = blob.type || 'image/jpeg';
  const uploaded = await client.uploadFile(blob, DEFAULT_SCREENSHOT_NAME, contentType, { maxBytes: limit });
  if (uploaded.ok) return { uploadId: uploaded.data, warnings: [] };
  if (uploaded.error.code === 'upload-too-large') {
    return {
      warnings: ['Saved without screenshot: Notion said it is too large.'],
    };
  }
  return { warnings: [], error: uploaded.error };
}

/** Pages currently matching the dedupe URL (empty when dedupe is off or the query fails). */
async function currentMatchIds(
  client: NotionClient,
  preset: Preset,
  schema: DataSourceSchema,
  url: string | null,
): Promise<Set<string> | null> {
  const propId = preset.dedupe.propertyId;
  if (propId === null || url === null) return null;
  const type = dedupeQueryType(schema, propId);
  if (type === null) return null;
  const res = await client.queryByUrl(preset.dataSourceId, propId, urlVariants(url), type);
  return res.ok ? new Set(res.data.map((m) => m.pageId)) : null;
}

/**
 * After a create that may or may not have gone through: look for a page with
 * our dedupe URL that was edited since the job started (and wasn't there before).
 */
async function recoverCreatedPage(
  client: NotionClient,
  preset: Preset,
  schema: DataSourceSchema,
  url: string | null,
  startedAt: Date,
  knownBefore: Set<string> | null,
  deps: SavePipelineDeps,
): Promise<NotionPageRef | null> {
  const propId = preset.dedupe.propertyId;
  if (propId === null || url === null) return null;
  const type = dedupeQueryType(schema, propId);
  if (type === null) return null;
  await deps.sleep(RECOVERY_DELAY_MS);
  const res = await client.queryByUrl(preset.dataSourceId, propId, urlVariants(url), type);
  if (!res.ok) return null;
  const earliest = startedAt.getTime() - RECOVERY_SKEW_MS;
  const latest = deps.now().getTime() + RECOVERY_SKEW_MS;
  for (const match of res.data) {
    if (knownBefore?.has(match.pageId)) continue;
    const t = Date.parse(match.lastEditedTime);
    if (Number.isNaN(t) || t < earliest || t > latest) continue;
    return { id: match.pageId, url: match.url };
  }
  return null;
}

async function save(
  jobId: string,
  request: SaveRequest,
  startedAt: Date,
  deps: SavePipelineDeps,
): Promise<Result<SaveSuccess> & { preset?: Preset; title?: string }> {
  // 1. Auth, preset, fresh schema, validation.
  const authed = await deps.requireClient();
  if (!authed.ok) return authed;
  const { auth, client } = authed.data;

  const presetRes = await deps.loadPreset(request.presetId);
  if (!presetRes.ok) return presetRes;
  const preset = presetRes.data;

  const schemaRes = await deps.fetchSchema(client, preset.dataSourceId);
  if (!schemaRes.ok) return schemaRes;
  const schema = schemaRes.data;

  const blocking = validatePreset(preset, schema).filter((i) => i.blocking);
  if (blocking.length > 0) return err(presetInvalidError(preset, blocking.map((i) => i.detail)));

  // 2. Normalize the dedupe URL so re-saves are detected (skipped when dedupe is off).
  const { values, dedupeUrl } = normalizeDedupeValue(preset, request.values, schema);
  const warnings: string[] = [];

  // 3. Screenshot upload (once).
  let uploadId: string | undefined;
  if (needsScreenshot(preset, values)) {
    await deps.updateJob(jobId, { status: 'uploading' });
    const upload = await uploadScreenshot(client, auth, request.capture, deps);
    if (upload.error) return err(upload.error);
    warnings.push(...upload.warnings);
    uploadId = upload.uploadId;
  }

  // 4. Build and write the page.
  await deps.updateJob(jobId, { status: 'creating' });
  const built = buildProperties(preset, values, schema, {
    ...(uploadId !== undefined ? { screenshotUploadId: uploadId } : {}),
    screenshotName: DEFAULT_SCREENSHOT_NAME,
  });
  warnings.push(...built.warnings);
  const extras = buildPageExtras(preset, request.capture, uploadId);
  const title = titleOf(built.properties, schema) || request.capture.title.trim() || 'Untitled';

  if (request.mode.kind === 'update') {
    const body: NotionUpdatePageBody = { properties: built.properties };
    if (extras.icon) body.icon = extras.icon;
    if (extras.cover) body.cover = extras.cover;
    const res = await client.updatePage(request.mode.pageId, body);
    if (!res.ok) return res;
    return { ...ok({ page: res.data, warnings, recovered: false }), preset, title };
  }

  // In duplicate mode a matching page already exists; remember it so recovery doesn't mistake it for ours.
  const knownBefore =
    request.mode.kind === 'duplicate' ? await currentMatchIds(client, preset, schema, dedupeUrl) : null;

  const body: NotionCreatePageBody = {
    parent: { type: 'data_source_id', data_source_id: preset.dataSourceId },
    properties: built.properties,
    ...extras,
  };
  const created = await client.createPage(body);
  if (created.ok) return { ...ok({ page: created.data, warnings, recovered: false }), preset, title };

  // 5. Ambiguous failure (timeout / offline / 5xx): never blindly retry.
  if (created.error.code !== 'network') return created;
  const recovered = await recoverCreatedPage(
    client,
    preset,
    schema,
    dedupeUrl,
    startedAt,
    knownBefore,
    deps,
  );
  if (recovered) return { ...ok({ page: recovered, warnings, recovered: true }), preset, title };
  return err({
    ...created.error,
    message:
      'Notion didn’t confirm the save, and Sitecatch couldn’t find the page. Check your database in Notion; if the page isn’t there, try again.',
    action: 'retry',
  });
}

/**
 * Runs one save job to completion, recording progress in the job state.
 * Resolves to the outcome (also reflected in `session:job:<id>`). Never throws.
 */
export async function runSavePipeline(
  jobId: string,
  request: SaveRequest,
  deps: SavePipelineDeps,
): Promise<Result<SaveSuccess>> {
  const startedAt = deps.now();
  await deps.badge.clear();
  let outcome: Awaited<ReturnType<typeof save>>;
  try {
    outcome = await save(jobId, request, startedAt, deps);
  } catch (thrown) {
    outcome = err(toAppError(thrown, 'Saving to Notion failed unexpectedly. Try again.'));
  }

  try {
    if (!outcome.ok) {
      await deps.updateJob(jobId, { status: 'error', error: outcome.error });
      await deps.badge.error();
      return err(outcome.error);
    }
    const { page, warnings } = outcome.data;
    if (warnings.length > 0) console.warn('[sitecatch] save finished with warnings:', warnings);
    await deps.updateJob(jobId, {
      status: 'done',
      pageUrl: page.url,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
    // The page is saved; history and last-used preset are best-effort.
    const preset = outcome.preset;
    if (preset) {
      try {
        await deps.addHistory({
          pageId: page.id,
          pageUrl: page.url,
          title: outcome.title ?? 'Untitled',
          sourceUrl: request.capture.url,
          presetId: preset.id,
          presetName: preset.name,
          savedAt: deps.now().toISOString(),
        });
        await deps.setLastPresetId(preset.id);
      } catch (thrown) {
        console.warn('[sitecatch] could not record save history', thrown);
      }
    }
    await deps.badge.success();
    return ok(outcome.data);
  } catch (thrown) {
    const error = toAppError(thrown, 'Saving to Notion failed unexpectedly. Try again.');
    try {
      await deps.updateJob(jobId, { status: 'error', error });
    } catch {
      // storage is gone; nothing else to do
    }
    return err(error);
  }
}
