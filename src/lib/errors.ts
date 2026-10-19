/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * Every operation that can fail across a module or message boundary returns a
 * `Result<T>` instead of throwing. Errors carry a stable `code` (for logic and
 * tests), a user-facing `message` (plain language, tells the user what to do
 * next), and an optional `action` the UI can render as a button.
 */

/** Stable, machine-readable error codes. UI and tests switch on these. */
export type AppErrorCode =
  /** No Notion integration token saved yet. */
  | 'no-token'
  /** Notion rejected the token (HTTP 401) — revoked, mistyped, or wrong workspace. */
  | 'invalid-token'
  /** The user has not granted access to https://api.notion.com/* (optional host permission). */
  | 'no-host-permission'
  /** Database/data source not found or not shared with the integration (HTTP 404 / object_not_found). */
  | 'db-not-shared'
  /** Notion rejected the request body (HTTP 400 validation_error) or local input is invalid. */
  | 'validation'
  /** Notion rate limit (HTTP 429) persisted after retries. */
  | 'rate-limited'
  /** Offline, DNS, timeout, or Notion 5xx. */
  | 'network'
  /** A file (e.g. screenshot) exceeds Notion's single-part upload limit even after downscaling. */
  | 'upload-too-large'
  /** The active tab cannot be scripted/captured (about:, browser stores, PDF viewer, reader mode…). */
  | 'restricted-page'
  /** A preset references properties that no longer exist or changed type. */
  | 'preset-invalid'
  /** A referenced entity (preset, job…) does not exist locally. */
  | 'not-found'
  /** Anything else. Always include `detail` for debugging. */
  | 'unknown';

/** A UI affordance suggested to recover from the error. */
export type AppErrorAction =
  /** Open the options page setup wizard (token missing/invalid). */
  | 'open-setup'
  /** Show instructions to share the database with the integration (••• → Connections). */
  | 'reshare-db'
  /** The same operation may succeed if retried. */
  | 'retry'
  /** Open the preset editor to fix mappings. */
  | 'edit-preset'
  /** Call `browser.permissions.request` from a click handler. */
  | 'grant-permission';

export interface AppError {
  code: AppErrorCode;
  /** User-facing, actionable message. Never include the token or raw stack traces. */
  message: string;
  action?: AppErrorAction;
  /** Developer detail (HTTP status, Notion error code/message). Safe to show in a "details" disclosure. */
  detail?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function err(error: AppError): { ok: false; error: AppError };
export function err(
  code: AppErrorCode,
  message: string,
  extra?: Pick<AppError, 'action' | 'detail'>,
): { ok: false; error: AppError };
export function err(
  codeOrError: AppErrorCode | AppError,
  message?: string,
  extra?: Pick<AppError, 'action' | 'detail'>,
): { ok: false; error: AppError } {
  if (typeof codeOrError === 'object') return { ok: false, error: codeOrError };
  return { ok: false, error: { code: codeOrError, message: message ?? '', ...extra } };
}

/** Type guard for values that crossed a structured-clone boundary (messages, storage). */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * Normalizes anything thrown into an `AppError` with code `unknown`.
 * Domain modules (e.g. the Notion client) should map known failures to specific
 * codes themselves and only fall back to this.
 */
export function toAppError(thrown: unknown, fallbackMessage = 'Something went wrong. Please try again.'): AppError {
  if (isAppError(thrown)) return thrown;
  const detail = thrown instanceof Error ? thrown.message : String(thrown);
  return { code: 'unknown', message: fallbackMessage, action: 'retry', detail };
}
