/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * Popup/options ⇄ background request/response protocol. All Notion API calls,
 * token access, capture and saving happen in the background; UI pages only
 * send these requests via `sendRequest()` (./client.ts). Every response is a
 * `Result<T>` so errors are always structured and serializable.
 *
 * A request is `{ type, ...params }`, e.g. `{ type: 'ds/schema', dataSourceId }`.
 */
import type { Browser } from 'wxt/browser';
import type { AppError, Result } from '@/lib/errors';
import type { CaptureResult } from '@/lib/extract/types';
import type { DataSourceSchema, DataSourceSummary, DuplicateMatch } from '@/lib/notion/types';
import type { FormValues } from '@/lib/presets/types';

/** How a save should treat existing pages. */
export type SaveMode =
  /** Normal save (no duplicate found, or dedupe disabled). */
  | { kind: 'create' }
  /** Overwrite properties + cover of an existing page (body is not appended). */
  | { kind: 'update'; pageId: string }
  /** User confirmed saving a new page despite a duplicate. */
  | { kind: 'duplicate' };

export type JobStatus = 'queued' | 'uploading' | 'creating' | 'done' | 'error';

/** Background save job, persisted in storage.session so it survives popup close. */
export interface JobState {
  id: string;
  status: JobStatus;
  /** Set when status === 'done'. */
  pageUrl?: string;
  /** Set when status === 'error'. */
  error?: AppError;
  presetName?: string;
  /** ISO 8601. */
  startedAt: string;
}

/** Params placeholder for requests that take no arguments. */
export type NoParams = object;

/** Map of request type → params (without `type`) and response data. */
export interface RequestMap {
  /** Validate a pasted token (GET /v1/users/me) and store it on success. */
  'auth/validate': {
    params: { token: string };
    response: {
      botName: string;
      workspaceName: string | null;
      /** Workspace single-file upload limit (`bot.workspace_limits`), when Notion reports it. */
      maxFileUploadBytes?: number;
    };
  };
  /** Cheap status check used by popup/options on open. Never returns the token. */
  'auth/status': {
    params: NoParams;
    response: {
      hasToken: boolean;
      hostPermission: boolean;
      workspaceName?: string;
      /** From the last successful validation, when known. */
      maxFileUploadBytes?: number;
    };
  };
  /** Forget the stored token. */
  'auth/clear': {
    params: NoParams;
    response: null;
  };
  /** Data sources visible to the integration. */
  'ds/list': {
    params: { query?: string };
    response: DataSourceSummary[];
  };
  /** Schema for one data source; cached in storage.session unless `force`. */
  'ds/schema': {
    params: { dataSourceId: string; force?: boolean };
    response: DataSourceSchema;
  };
  /** Probe + screenshot the given tab. */
  'capture/run': {
    params: { tabId: number };
    response: CaptureResult;
  };
  /** Find existing pages whose dedupe property matches the normalized URL. */
  'dup/check': {
    params: { presetId: string; url: string };
    response: { matches: DuplicateMatch[] };
  };
  /** Start a background save; returns immediately. Poll with 'job/get'. */
  'save/start': {
    params: { presetId: string; values: FormValues; capture: CaptureResult; mode: SaveMode };
    response: { jobId: string };
  };
  'job/get': {
    params: { jobId: string };
    response: JobState;
  };
}

export type RequestType = keyof RequestMap;

/** A full request message for type T. */
export type Request<T extends RequestType = RequestType> = {
  [K in T]: { type: K } & RequestMap[K]['params'];
}[T];

/** Response data for type T (wrapped in Result on the wire). */
export type Response<T extends RequestType> = RequestMap[T]['response'];

/** Union of every valid request message. */
export type AnyRequest = Request;

export type MessageSender = Browser.runtime.MessageSender;

/** A background handler for one request type. Must never throw; return `err(...)` instead. */
export type Handler<T extends RequestType> = (
  request: Request<T>,
  sender: MessageSender,
) => Promise<Result<Response<T>>>;

/** The background router's full handler table — one handler per request type. */
export type Handlers = { [K in RequestType]: Handler<K> };

const REQUEST_TYPES: Record<RequestType, true> = {
  'auth/validate': true,
  'auth/status': true,
  'auth/clear': true,
  'ds/list': true,
  'ds/schema': true,
  'capture/run': true,
  'dup/check': true,
  'save/start': true,
  'job/get': true,
};

/** Runtime guard for incoming messages (the router ignores anything else). */
export function isRequest(message: unknown): message is AnyRequest {
  if (typeof message !== 'object' || message === null) return false;
  const type = (message as { type?: unknown }).type;
  return typeof type === 'string' && Object.hasOwn(REQUEST_TYPES, type);
}
