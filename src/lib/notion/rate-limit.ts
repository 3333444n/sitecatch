/**
 * Request pacing + retry for the Notion client.
 *
 * - All requests go through one serial queue spaced ~3 req/s (Notion's average
 *   limit for non-Enterprise workspaces: 180 req/min).
 * - 429 (and 529 service_overload) → wait `Retry-After` seconds (default 1s),
 *   up to 5 retries. The queue is held while waiting, so new requests pause too.
 * - 502/503/504 and network errors/timeouts → backoff 0.5s / 1s / 2s.
 * - Each attempt gets its own timeout (`AbortSignal.timeout`).
 *
 * Retry is configurable per call: non-idempotent calls (page creation) must
 * not retry transient failures, because the request may have succeeded.
 */

export interface RetryPolicy {
  /** Retry 429/529 honoring Retry-After. Safe for every call: Notion rejected the request. */
  rateLimit: boolean;
  /** Retry 502/503/504, network errors and timeouts. Only for idempotent/safe calls. */
  transient: boolean;
}

export const RETRY_ALL: RetryPolicy = { rateLimit: true, transient: true };
/** For non-idempotent writes (POST /v1/pages): a timeout may mean the page was created. */
export const RETRY_RATE_LIMIT_ONLY: RetryPolicy = { rateLimit: true, transient: false };

export const MAX_RATE_LIMIT_RETRIES = 5;
export const TRANSIENT_BACKOFF_MS: readonly number[] = [500, 1000, 2000];
export const DEFAULT_RETRY_AFTER_MS = 1000;
/** Never wait longer than this for a single Retry-After. */
export const MAX_RETRY_AFTER_MS = 60_000;
export const DEFAULT_MIN_INTERVAL_MS = 334;
export const DEFAULT_TIMEOUT_MS = 20_000;

const RATE_LIMIT_STATUSES = new Set([429, 529]);
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parses a Retry-After header (delta-seconds or HTTP-date) into ms. */
export function parseRetryAfter(value: string | null, nowMs: number = Date.now()): number {
  if (value === null || value.trim() === '') return DEFAULT_RETRY_AFTER_MS;
  const trimmed = value.trim();
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    ms = Number(trimmed) * 1000;
  } else {
    const date = Date.parse(trimmed);
    if (Number.isNaN(date)) return DEFAULT_RETRY_AFTER_MS;
    ms = date - nowMs;
  }
  if (!Number.isFinite(ms) || ms < 0) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

export interface RequestQueue {
  /** Runs `task` after all previously queued tasks finished. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Waits until the next request slot (min spacing between request starts). Call inside a task. */
  slot(): Promise<void>;
}

export interface QueueOptions {
  minIntervalMs?: number;
  sleep?: Sleep;
  now?: () => number;
}

export function createRequestQueue(options: QueueOptions = {}): RequestQueue {
  const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? (() => Date.now());
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      // Keep the chain alive regardless of the task's outcome.
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    async slot(): Promise<void> {
      const wait = lastStart + minInterval - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
    },
  };
}

export type AttemptOutcome =
  /** Final HTTP response (2xx, non-retryable error, or retryable error after retries ran out). */
  | { kind: 'response'; response: Response }
  /** `fetch` threw (network/timeout) and no retry was allowed/left. */
  | { kind: 'thrown'; cause: unknown };

export interface ExecuteOptions {
  policy: RetryPolicy;
  queue: RequestQueue;
  sleep?: Sleep;
  now?: () => number;
}

/**
 * Runs `attempt` (one fetch) inside the queue, retrying per `policy`.
 * `attempt` must create a fresh request (and fresh timeout signal) each call.
 */
export function executeWithRetry(
  attempt: () => Promise<Response>,
  options: ExecuteOptions,
): Promise<AttemptOutcome> {
  const { policy, queue } = options;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? (() => Date.now());

  return queue.run(async (): Promise<AttemptOutcome> => {
    let rateLimitRetries = 0;
    let transientRetries = 0;
    for (;;) {
      await queue.slot();
      let response: Response;
      try {
        response = await attempt();
      } catch (cause) {
        const backoff = TRANSIENT_BACKOFF_MS[transientRetries];
        if (policy.transient && backoff !== undefined) {
          transientRetries++;
          await sleep(backoff);
          continue;
        }
        return { kind: 'thrown', cause };
      }

      if (RATE_LIMIT_STATUSES.has(response.status)) {
        if (policy.rateLimit && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
          rateLimitRetries++;
          await discardBody(response);
          await sleep(parseRetryAfter(response.headers.get('Retry-After'), now()));
          continue;
        }
        return { kind: 'response', response };
      }

      if (TRANSIENT_STATUSES.has(response.status)) {
        const backoff = TRANSIENT_BACKOFF_MS[transientRetries];
        if (policy.transient && backoff !== undefined) {
          transientRetries++;
          await discardBody(response);
          await sleep(backoff);
          continue;
        }
        return { kind: 'response', response };
      }

      return { kind: 'response', response };
    }
  });
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // ignore
  }
}
