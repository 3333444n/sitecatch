/**
 * Maps Notion HTTP/API failures and network failures to actionable `AppError`s.
 *
 * Notion error bodies look like
 * `{ object: 'error', status: 404, code: 'object_not_found', message: '…', request_id: '…' }`.
 * See https://developers.notion.com/reference/status-codes.
 *
 * The token is never part of an error: `detail` only contains status, Notion's
 * code/message and request id, and is additionally passed through `redactSecrets`.
 */
import type { AppError } from '@/lib/errors';

/** Which client operation failed — lets us tailor the copy. */
export type NotionOperation =
  | 'auth'
  | 'search'
  | 'data-source'
  | 'query'
  | 'create-page'
  | 'update-page'
  | 'upload';

export interface NotionErrorBody {
  object?: string;
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
}

/** Narrow an unknown JSON value to a Notion error body (fields that aren't strings/numbers are dropped). */
export function parseErrorBody(json: unknown): NotionErrorBody | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const body: NotionErrorBody = {};
  if (typeof o.object === 'string') body.object = o.object;
  if (typeof o.status === 'number') body.status = o.status;
  if (typeof o.code === 'string') body.code = o.code;
  if (typeof o.message === 'string') body.message = o.message;
  if (typeof o.request_id === 'string') body.request_id = o.request_id;
  return body.code !== undefined || body.message !== undefined ? body : null;
}

/** Notion internal integration secrets start with `ntn_` (new) or `secret_` (legacy). */
const SECRET_PATTERN = /\b(?:ntn|secret)_[A-Za-z0-9]{8,}/g;

/** Removes anything that looks like a Notion token (and the exact token, if given). */
export function redactSecrets(text: string, token?: string): string {
  let out = text;
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(SECRET_PATTERN, '[redacted]');
}

/** Returns a copy of the error with `message`/`detail` scrubbed of secrets. */
export function redactError(error: AppError, token?: string): AppError {
  const out: AppError = { ...error, message: redactSecrets(error.message, token) };
  if (error.detail !== undefined) out.detail = redactSecrets(error.detail, token);
  return out;
}

const SHARE_HINT =
  'Open the database in Notion → ••• → Connections → add your integration, then try again.';

const UPLOAD_SIZE_PATTERN = /(too large|exceeds?|size limit|file size|maximum size|max(imum)? file)/i;

function buildDetail(status: number | null, body: NotionErrorBody | null): string {
  const parts: string[] = [];
  if (status !== null) parts.push(`HTTP ${status}`);
  if (body?.code) parts.push(body.code);
  let detail = parts.join(' ');
  if (body?.message) detail += `${detail ? ': ' : ''}${body.message}`;
  if (body?.request_id) detail += ` (request_id ${body.request_id})`;
  return detail;
}

function trimNotionMessage(message: string | undefined): string {
  if (!message) return '';
  const m = message.trim();
  return m.length > 300 ? `${m.slice(0, 297)}…` : m;
}

/** Maps a non-2xx Notion response to an `AppError`. */
export function mapHttpError(
  status: number,
  body: NotionErrorBody | null,
  op: NotionOperation,
): AppError {
  const code = body?.code;
  const detail = buildDetail(status, body);

  if (status === 401 || code === 'unauthorized') {
    return {
      code: 'invalid-token',
      message:
        'Notion didn’t accept your integration token — it may be mistyped or revoked. Open setup and paste your integration’s secret again.',
      action: 'open-setup',
      detail,
    };
  }

  if (status === 403 || code === 'restricted_resource') {
    // No dedicated AppErrorCode for missing capabilities yet (contract change requested).
    return {
      code: 'unknown',
      message:
        'Your Notion integration isn’t allowed to do this. In notion.so/profile/integrations, open your integration → Capabilities and enable “Read content”, “Update content” and “Insert content”, then try again.',
      action: 'open-setup',
      detail,
    };
  }

  if (status === 404 || code === 'object_not_found') {
    const what =
      op === 'update-page'
        ? 'The existing Notion page couldn’t be found — it may have been deleted, or its database isn’t shared with your integration.'
        : 'Sitecatch can’t access this Notion database — it was deleted or isn’t shared with your integration.';
    return { code: 'db-not-shared', message: `${what} ${SHARE_HINT}`, action: 'reshare-db', detail };
  }

  if (
    status === 413 ||
    (op === 'upload' && status === 400 && UPLOAD_SIZE_PATTERN.test(body?.message ?? ''))
  ) {
    return {
      code: 'upload-too-large',
      message:
        'The screenshot is too large for Notion to accept (free workspaces allow 5 MiB per file). Try again without the screenshot, or capture a smaller window.',
      detail,
    };
  }

  if (status === 429 || code === 'rate_limited') {
    return {
      code: 'rate-limited',
      message: 'Notion is rate-limiting requests right now. Wait a minute and try again.',
      action: 'retry',
      detail,
    };
  }

  if (status === 400) {
    const notionMessage = trimNotionMessage(body?.message);
    const isValidation = code === 'validation_error' || code === undefined;
    return {
      code: 'validation',
      message: isValidation
        ? `Notion rejected the data${notionMessage ? `: “${notionMessage}”` : ''}. Check the preset’s mappings and the values you entered.`
        : `Notion rejected the request${notionMessage ? `: “${notionMessage}”` : ''}.`,
      ...(isValidation && (op === 'create-page' || op === 'update-page')
        ? { action: 'edit-preset' as const }
        : {}),
      detail,
    };
  }

  if (status === 409 || code === 'conflict_error') {
    return {
      code: 'network',
      message: 'Notion couldn’t save because of a conflicting edit. Try again.',
      action: 'retry',
      detail,
    };
  }

  if (status >= 500) {
    return {
      code: 'network',
      message: 'Notion is having trouble right now. Try again in a moment.',
      action: 'retry',
      detail,
    };
  }

  return {
    code: 'unknown',
    message: 'Notion returned an unexpected error. Try again; if it keeps happening, check the details.',
    action: 'retry',
    detail,
  };
}

function isTimeout(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause.name === 'TimeoutError' ||
      cause.name === 'AbortError')
  );
}

/** Maps a thrown `fetch` failure (offline, DNS, CORS, timeout) to an `AppError`. */
export function mapNetworkError(cause: unknown, op: NotionOperation): AppError {
  const timeout = isTimeout(cause);
  const raw = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  const detail = timeout ? `timeout (${raw})` : raw;
  const base = timeout
    ? 'Notion took too long to respond.'
    : 'Couldn’t reach Notion — check your internet connection.';
  const message =
    op === 'create-page'
      ? `${base} The page may or may not have been created; retrying checks for duplicates first.`
      : `${base} Then try again.`;
  return { code: 'network', message, action: 'retry', detail };
}

/** Error for responses that were 2xx but not shaped as expected. */
export function unexpectedResponseError(what: string): AppError {
  return {
    code: 'unknown',
    message: 'Notion sent a response Sitecatch didn’t understand. Try again.',
    action: 'retry',
    detail: `Unexpected response: ${what}`,
  };
}
