/**
 * Minimal Notion REST client (plain `fetch`, Notion-Version 2026-03-11).
 * Background-only: the token never leaves this module except in the
 * Authorization header sent to api.notion.com.
 *
 * Every method resolves to a `Result<T>` and never throws.
 */
import { err, ok, type AppError, type Result } from '@/lib/errors';
import type {
  DataSourceSchema,
  DataSourceSummary,
  DuplicateMatch,
  NotionColor,
  NotionCreatePageBody,
  NotionIcon,
  NotionPageRef,
  NotionPropertyType,
  PropertySchema,
  NotionUpdatePageBody,
  SelectOption,
} from './types';
import { endpoints, MAX_PAGE_SIZE, NOTION_VERSION, SINGLE_PART_UPLOAD_MAX_BYTES } from './endpoints';
import {
  mapHttpError,
  mapNetworkError,
  parseErrorBody,
  redactError,
  unexpectedResponseError,
  type NotionOperation,
} from './errors';
import {
  createRequestQueue,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  executeWithRetry,
  realSleep,
  RETRY_ALL,
  RETRY_RATE_LIMIT_ONLY,
  type RetryPolicy,
  type Sleep,
} from './rate-limit';

export interface NotionMe {
  botName: string;
  workspaceName: string | null;
  /** From `bot.workspace_limits` — e.g. 5 MiB on free workspaces. */
  maxFileUploadBytes?: number;
}

export interface NotionClient {
  getMe(): Promise<Result<NotionMe>>;
  searchDataSources(query?: string): Promise<Result<DataSourceSummary[]>>;
  getDataSource(id: string): Promise<Result<DataSourceSchema>>;
  /**
   * Pages whose `propertyId` equals any of `urls` (OR filter). `propertyType`
   * is the dedupe property's type (`url` by default; `rich_text` also works).
   */
  queryByUrl(
    dataSourceId: string,
    propertyId: string,
    urls: string[],
    propertyType?: 'url' | 'rich_text',
  ): Promise<Result<DuplicateMatch[]>>;
  /** Not retried on network errors/timeouts/5xx: the caller should re-run the duplicate check. */
  createPage(body: NotionCreatePageBody): Promise<Result<NotionPageRef>>;
  updatePage(pageId: string, body: NotionUpdatePageBody): Promise<Result<NotionPageRef>>;
  /** Single-part upload. Resolves to the file upload id to reference as `{ type: 'file_upload', file_upload: { id } }`. */
  uploadFile(
    blob: Blob,
    filename: string,
    contentType: string,
    options?: { maxBytes?: number },
  ): Promise<Result<string>>;
}

export interface NotionClientOptions {
  token: string;
  fetch?: typeof fetch;
  /** Per-attempt timeout. Default 20 s. */
  timeoutMs?: number;
  /** Min spacing between request starts. Default ~334 ms (3 req/s). */
  minIntervalMs?: number;
  /** Injected for tests. */
  sleep?: Sleep;
  now?: () => number;
}

/** Safety cap so a misbehaving cursor can't loop forever. */
const MAX_SEARCH_PAGES = 50;

// ---------------------------------------------------------------------------
// Small JSON helpers (responses are `unknown` until narrowed)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function plainText(richText: unknown): string {
  if (!Array.isArray(richText)) return '';
  return richText
    .map((rt) => {
      if (!isObj(rt)) return '';
      const p = str(rt.plain_text);
      if (p !== undefined) return p;
      return isObj(rt.text) ? (str(rt.text.content) ?? '') : '';
    })
    .join('');
}

const KNOWN_PROPERTY_TYPES = new Set<NotionPropertyType>([
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'people',
  'files',
  'checkbox',
  'url',
  'email',
  'phone_number',
  'relation',
  'formula',
  'rollup',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
  'unique_id',
  'verification',
  'button',
]);

const COLORS = new Set<NotionColor>([
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]);

function toPropertyType(v: unknown): NotionPropertyType {
  return typeof v === 'string' && KNOWN_PROPERTY_TYPES.has(v as NotionPropertyType)
    ? (v as NotionPropertyType)
    : 'unsupported';
}

function toOptions(config: unknown): SelectOption[] {
  if (!isObj(config) || !Array.isArray(config.options)) return [];
  const out: SelectOption[] = [];
  for (const o of config.options) {
    if (!isObj(o)) continue;
    const name = str(o.name);
    if (name === undefined) continue;
    const opt: SelectOption = { name };
    const id = str(o.id);
    if (id !== undefined) opt.id = id;
    const color = str(o.color);
    if (color !== undefined && COLORS.has(color as NotionColor)) opt.color = color as NotionColor;
    out.push(opt);
  }
  return out;
}

function toIcon(icon: unknown): NotionIcon | undefined {
  if (!isObj(icon)) return undefined;
  switch (icon.type) {
    case 'emoji': {
      const emoji = str(icon.emoji);
      return emoji ? { kind: 'emoji', emoji } : undefined;
    }
    case 'external':
    case 'file':
    case 'custom_emoji': {
      const inner = icon[icon.type];
      const url = isObj(inner) ? str(inner.url) : undefined;
      return url ? { kind: 'url', url } : undefined;
    }
    default:
      return undefined;
  }
}

export function mapDataSourceSummary(raw: unknown): DataSourceSummary | null {
  if (!isObj(raw) || raw.object !== 'data_source') return null;
  const id = str(raw.id);
  if (!id) return null;
  const summary: DataSourceSummary = { id, name: plainText(raw.title).trim() || 'Untitled' };
  if (isObj(raw.parent) && raw.parent.type === 'database_id') {
    const dbId = str(raw.parent.database_id);
    if (dbId) summary.databaseId = dbId;
  }
  const icon = toIcon(raw.icon);
  if (icon) summary.icon = icon;
  const url = str(raw.url);
  if (url) summary.url = url;
  return summary;
}

export function mapDataSourceSchema(raw: unknown): DataSourceSchema | null {
  if (!isObj(raw) || raw.object !== 'data_source' || !isObj(raw.properties)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const properties: Record<string, PropertySchema> = {};
  let titlePropertyId: string | undefined;
  for (const [key, value] of Object.entries(raw.properties)) {
    if (!isObj(value)) continue;
    const propId = str(value.id);
    if (!propId) continue;
    const type = toPropertyType(value.type);
    const prop: PropertySchema = { id: propId, name: str(value.name) ?? key, type };
    if (type === 'select' || type === 'multi_select' || type === 'status') {
      prop.options = toOptions(value[type]);
    }
    properties[propId] = prop;
    if (type === 'title') titlePropertyId = propId;
  }
  if (titlePropertyId === undefined) return null;
  return { id, name: plainText(raw.title).trim() || 'Untitled', properties, titlePropertyId };
}

function pageTitle(properties: unknown): string {
  if (!isObj(properties)) return '';
  for (const value of Object.values(properties)) {
    if (isObj(value) && value.type === 'title') return plainText(value.title).trim();
  }
  return '';
}

export function mapDuplicateMatch(raw: unknown): DuplicateMatch | null {
  if (!isObj(raw) || raw.object !== 'page') return null;
  const pageId = str(raw.id);
  const url = str(raw.url);
  if (!pageId || !url) return null;
  if (raw.in_trash === true) return null;
  return {
    pageId,
    url,
    title: pageTitle(raw.properties) || 'Untitled',
    lastEditedTime: str(raw.last_edited_time) ?? '',
  };
}

function toPageRef(raw: unknown): NotionPageRef | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const url = str(raw.url);
  return id && url ? { id, url } : null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

interface RequestSpec {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  op: NotionOperation;
  json?: unknown;
  form?: FormData;
  policy?: RetryPolicy;
}

export function createNotionClient(options: NotionClientOptions): NotionClient {
  const { token } = options;
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? (() => Date.now());
  const queue = createRequestQueue({
    minIntervalMs: options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    sleep,
    now,
  });

  function fail(error: AppError): { ok: false; error: AppError } {
    return err(redactError(error, token));
  }

  async function request(spec: RequestSpec): Promise<Result<unknown>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    };
    let body: BodyInit | undefined;
    if (spec.form) {
      // Let fetch set `multipart/form-data; boundary=…` itself.
      body = spec.form;
    } else if (spec.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(spec.json);
    }

    const outcome = await executeWithRetry(
      () =>
        doFetch(spec.url, {
          method: spec.method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      { policy: spec.policy ?? RETRY_ALL, queue, sleep, now },
    );

    if (outcome.kind === 'thrown') return fail(mapNetworkError(outcome.cause, spec.op));

    const { response } = outcome;
    let data: unknown = null;
    try {
      const text = await response.text();
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch (cause) {
      // A 2xx with an unreadable body is treated like a dropped connection;
      // error responses fall back to status-only mapping (data stays null).
      if (response.ok) return fail(mapNetworkError(cause, spec.op));
    }
    if (!response.ok) return fail(mapHttpError(response.status, parseErrorBody(data), spec.op));
    return ok(data);
  }

  return {
    async getMe() {
      const res = await request({ method: 'GET', url: endpoints.me(), op: 'auth' });
      if (!res.ok) return res;
      const raw = res.data;
      if (!isObj(raw) || raw.object !== 'user') return fail(unexpectedResponseError('users/me'));
      const bot = isObj(raw.bot) ? raw.bot : {};
      const me: NotionMe = {
        botName: str(raw.name) ?? 'Notion integration',
        workspaceName: str(bot.workspace_name) ?? null,
      };
      const limits = bot.workspace_limits;
      if (isObj(limits) && typeof limits.max_file_upload_size_in_bytes === 'number') {
        me.maxFileUploadBytes = limits.max_file_upload_size_in_bytes;
      }
      return ok(me);
    },

    async searchDataSources(query) {
      const out: DataSourceSummary[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
        const json: Json = {
          filter: { property: 'object', value: 'data_source' },
          sort: { timestamp: 'last_edited_time', direction: 'descending' },
          page_size: MAX_PAGE_SIZE,
        };
        if (query) json.query = query;
        if (cursor) json.start_cursor = cursor;
        const res = await request({ method: 'POST', url: endpoints.search(), op: 'search', json });
        if (!res.ok) return res;
        const raw = res.data;
        if (!isObj(raw) || !Array.isArray(raw.results)) return fail(unexpectedResponseError('search'));
        for (const r of raw.results) {
          if (isObj(r) && r.in_trash === true) continue;
          const summary = mapDataSourceSummary(r);
          if (summary) out.push(summary);
        }
        const next = str(raw.next_cursor);
        if (raw.has_more !== true || !next) break;
        cursor = next;
      }
      return ok(out);
    },

    async getDataSource(id) {
      const res = await request({ method: 'GET', url: endpoints.dataSource(id), op: 'data-source' });
      if (!res.ok) return res;
      const schema = mapDataSourceSchema(res.data);
      return schema ? ok(schema) : fail(unexpectedResponseError('data source schema'));
    },

    async queryByUrl(dataSourceId, propertyId, urls, propertyType = 'url') {
      const unique = [...new Set(urls.filter((u) => u.length > 0))];
      if (unique.length === 0) return ok([]);
      const conditions = unique.map((u) => ({ property: propertyId, [propertyType]: { equals: u } }));
      const filter = conditions.length === 1 ? conditions[0] : { or: conditions };
      const res = await request({
        method: 'POST',
        url: endpoints.queryDataSource(dataSourceId),
        op: 'query',
        json: {
          filter,
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
          page_size: MAX_PAGE_SIZE,
          result_type: 'page',
        },
      });
      if (!res.ok) return res;
      const raw = res.data;
      if (!isObj(raw) || !Array.isArray(raw.results)) return fail(unexpectedResponseError('query'));
      const matches: DuplicateMatch[] = [];
      for (const r of raw.results) {
        const m = mapDuplicateMatch(r);
        if (m) matches.push(m);
      }
      return ok(matches);
    },

    async createPage(body) {
      const res = await request({
        method: 'POST',
        url: endpoints.pages(),
        op: 'create-page',
        json: body,
        policy: RETRY_RATE_LIMIT_ONLY,
      });
      if (!res.ok) return res;
      const ref = toPageRef(res.data);
      return ref ? ok(ref) : fail(unexpectedResponseError('create page'));
    },

    async updatePage(pageId, body) {
      const res = await request({
        method: 'PATCH',
        url: endpoints.page(pageId),
        op: 'update-page',
        json: body,
      });
      if (!res.ok) return res;
      const ref = toPageRef(res.data);
      return ref ? ok(ref) : fail(unexpectedResponseError('update page'));
    },

    async uploadFile(blob, filename, contentType, uploadOptions) {
      const limit = Math.min(
        uploadOptions?.maxBytes ?? SINGLE_PART_UPLOAD_MAX_BYTES,
        SINGLE_PART_UPLOAD_MAX_BYTES,
      );
      if (blob.size > limit) {
        return fail({
          ...mapHttpError(413, null, 'upload'),
          detail: `File is ${blob.size} bytes; limit is ${limit} bytes`,
        });
      }

      const created = await request({
        method: 'POST',
        url: endpoints.fileUploads(),
        op: 'upload',
        json: { mode: 'single_part', filename, content_type: contentType },
      });
      if (!created.ok) return created;
      const createdRaw = created.data;
      const id = isObj(createdRaw) ? str(createdRaw.id) : undefined;
      if (!id) return fail(unexpectedResponseError('file upload create'));

      const form = new FormData();
      // Wrap in a File so the part carries the filename and the declared content type.
      form.append('file', new File([blob], filename, { type: contentType }), filename);
      const sent = await request({
        method: 'POST',
        url: endpoints.sendFileUpload(id),
        op: 'upload',
        form,
      });
      if (!sent.ok) return sent;
      const sentRaw = sent.data;
      const status = isObj(sentRaw) ? str(sentRaw.status) : undefined;
      if (status !== 'uploaded') {
        return fail({
          code: 'unknown',
          message: 'Notion didn’t finish receiving the screenshot. Try saving again.',
          action: 'retry',
          detail: `file upload status: ${status ?? 'missing'}`,
        });
      }
      return ok(id);
    },
  };
}
