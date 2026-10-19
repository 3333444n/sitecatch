/**
 * Preset CRUD over storage.sync: one item per preset (`sync:preset:<id>`) plus
 * an ordered index (`sync:presetIndex`). Each item must stay under the
 * browser's 8 KB per-item sync quota.
 */
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import type { Result } from '@/lib/errors';
import { err, ok } from '@/lib/errors';
import type { DataSourceSchema, DataSourceSummary } from '@/lib/notion/types';
import { presetIndexItem, presetItem } from '@/lib/storage/items';
import { migratePreset } from './migrate';
import type { Mapping, Preset } from './types';

/** storage.sync QUOTA_BYTES_PER_ITEM (key + JSON value), Chrome and Firefox. */
export const SYNC_ITEM_QUOTA_BYTES = 8192;
/** Above this, `savePreset` reports `nearQuota` so the editor can warn. */
export const SYNC_ITEM_WARN_BYTES = 7 * 1024;

const PRESET_KEY_PREFIX = 'preset:';
const INDEX_KEY = 'presetIndex';

/** Bytes this preset occupies in storage.sync (key + serialized value). */
export function presetSizeBytes(preset: Preset): number {
  return new TextEncoder().encode(PRESET_KEY_PREFIX + preset.id + JSON.stringify(preset)).length;
}

async function readPreset(id: string): Promise<Preset | null> {
  const raw: unknown = await presetItem(id).getValue();
  if (raw === null) return null;
  const migrated = migratePreset(raw);
  return migrated.ok ? migrated.data : null;
}

/** All presets in display order. Damaged/missing entries are skipped. */
export async function listPresets(): Promise<Preset[]> {
  const ids = await presetIndexItem.getValue();
  if (ids.length === 0) return [];
  const entries = await storage.getItems(ids.map((id) => `sync:${PRESET_KEY_PREFIX}${id}` as const));
  const presets: Preset[] = [];
  for (const { value } of entries) {
    if (value === null || value === undefined) continue;
    const migrated = migratePreset(value);
    if (migrated.ok) presets.push(migrated.data);
  }
  return presets;
}

export async function getPreset(id: string): Promise<Result<Preset>> {
  const preset = await readPreset(id);
  if (!preset) {
    return err('not-found', 'This preset no longer exists. Pick another one or create a new preset.', {
      action: 'edit-preset',
      detail: `preset ${id}`,
    });
  }
  return ok(preset);
}

export interface SavePresetResult {
  preset: Preset;
  sizeBytes: number;
  /** True when the preset is close to the 8 KB sync limit. */
  nearQuota: boolean;
}

/** Creates or updates a preset; bumps `updatedAt` and appends new ids to the index. */
export async function savePreset(input: Preset, now: Date = new Date()): Promise<Result<SavePresetResult>> {
  const preset: Preset = { ...input, updatedAt: now.toISOString() };
  const sizeBytes = presetSizeBytes(preset);
  if (sizeBytes > SYNC_ITEM_QUOTA_BYTES) {
    return err(
      'validation',
      'This preset is too large to sync (over 8 KB). Remove some mappings or shorten fixed values, then save again.',
      { action: 'edit-preset', detail: `${sizeBytes} bytes` },
    );
  }
  try {
    await presetItem(preset.id).setValue(preset);
    const ids = await presetIndexItem.getValue();
    if (!ids.includes(preset.id)) await presetIndexItem.setValue([...ids, preset.id]);
  } catch (e) {
    return err('unknown', 'Could not save the preset. Your browser storage may be full; try again.', {
      action: 'retry',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  return ok({ preset, sizeBytes, nearQuota: sizeBytes > SYNC_ITEM_WARN_BYTES });
}

export async function deletePreset(id: string): Promise<void> {
  await presetItem(id).removeValue();
  const ids = await presetIndexItem.getValue();
  if (ids.includes(id)) await presetIndexItem.setValue(ids.filter((x) => x !== id));
}

/**
 * Sets display order. Unknown ids are ignored; indexed ids missing from `ids`
 * keep their relative order at the end.
 */
export async function reorderPresets(ids: string[]): Promise<void> {
  const current = await presetIndexItem.getValue();
  const known = new Set(current);
  const ordered = [...new Set(ids)].filter((id) => known.has(id));
  const rest = current.filter((id) => !ordered.includes(id));
  await presetIndexItem.setValue([...ordered, ...rest]);
}

/** Calls `cb` with the full ordered list whenever any preset or the index changes. Returns unwatch. */
export function watchPresets(cb: (presets: Preset[]) => void): () => void {
  let seq = 0;
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'sync') return;
    if (!Object.keys(changes).some((k) => k === INDEX_KEY || k.startsWith(PRESET_KEY_PREFIX))) return;
    const mine = ++seq;
    void listPresets().then((presets) => {
      // Drop stale reads when several changes land in quick succession.
      if (mine === seq) cb(presets);
    });
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}

/**
 * New preset with sensible defaults: title ← og:title (fallback page title),
 * first url property ← page URL and used for duplicate detection.
 */
export function createEmptyPreset(
  ds: DataSourceSummary,
  schema: DataSourceSchema,
  now: Date = new Date(),
): Preset {
  const mappings: Mapping[] = [];
  const titleProp = schema.properties[schema.titlePropertyId];
  if (titleProp) {
    mappings.push({
      propertyId: titleProp.id,
      propertyName: titleProp.name,
      propertyType: 'title',
      source: { kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] },
      editableInPopup: true,
    });
  }
  const urlProp = Object.values(schema.properties).find((p) => p.type === 'url');
  if (urlProp) {
    mappings.push({
      propertyId: urlProp.id,
      propertyName: urlProp.name,
      propertyType: 'url',
      source: { kind: 'extractor', extractor: 'url' },
      editableInPopup: false,
    });
  }
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: ds.name,
    dataSourceId: ds.id,
    dataSourceName: ds.name,
    mappings,
    screenshot: { filesPropertyId: null, bodyImage: false },
    cover: 'none',
    icon: 'favicon',
    dedupe: { propertyId: urlProp?.id ?? null },
    updatedAt: now.toISOString(),
  };
}
