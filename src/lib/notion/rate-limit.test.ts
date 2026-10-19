import { describe, expect, it } from 'vitest';
import {
  createRequestQueue,
  DEFAULT_RETRY_AFTER_MS,
  executeWithRetry,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
  RETRY_ALL,
  RETRY_RATE_LIMIT_ONLY,
} from './rate-limit';
import { fakeSleep } from './test-helpers';

function res(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : '{}', { status, headers });
}

function sequence(items: (Response | Error)[]) {
  let calls = 0;
  const attempt = () => {
    const item = items[calls++];
    if (item === undefined) return Promise.reject(new Error('no more'));
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item);
  };
  return { attempt, count: () => calls };
}

describe('parseRetryAfter', () => {
  it('parses seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter('0.5')).toBe(500);
  });

  it('parses HTTP dates relative to now', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    expect(parseRetryAfter('Sun, 18 Oct 2026 12:00:03 GMT', now)).toBe(3000);
  });

  it('defaults to 1s for missing/garbage/past values', () => {
    expect(parseRetryAfter(null)).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(parseRetryAfter('')).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(parseRetryAfter('soon')).toBe(DEFAULT_RETRY_AFTER_MS);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:00 GMT', Date.now())).toBe(DEFAULT_RETRY_AFTER_MS);
  });

  it('caps long waits', () => {
    expect(parseRetryAfter('3600')).toBe(MAX_RETRY_AFTER_MS);
  });
});

describe('createRequestQueue', () => {
  it('spaces request starts by minIntervalMs', async () => {
    let t = 0;
    const delays: number[] = [];
    const queue = createRequestQueue({
      minIntervalMs: 334,
      now: () => t,
      sleep: (ms) => {
        delays.push(ms);
        t += ms;
        return Promise.resolve();
      },
    });
    const starts: number[] = [];
    const task = async () => {
      await queue.slot();
      starts.push(t);
      t += 10; // request takes 10ms
    };
    await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    expect(starts).toEqual([0, 334, 668]);
    expect(delays).toEqual([324, 324]);
  });

  it('keeps going after a task rejects', async () => {
    const queue = createRequestQueue({ minIntervalMs: 0 });
    const failing = queue.run(() => Promise.reject(new Error('boom')));
    const next = queue.run(() => Promise.resolve(42));
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe(42);
  });
});

describe('executeWithRetry', () => {
  const queue = () => createRequestQueue({ minIntervalMs: 0 });

  it('returns 2xx immediately', async () => {
    const { sleep, delays } = fakeSleep();
    const s = sequence([res(200)]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_ALL, queue: queue(), sleep });
    expect(out.kind).toBe('response');
    expect(s.count()).toBe(1);
    expect(delays).toEqual([]);
  });

  it('does not retry 4xx other than 429', async () => {
    const { sleep } = fakeSleep();
    const s = sequence([res(400), res(200)]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_ALL, queue: queue(), sleep });
    expect(out.kind === 'response' && out.response.status).toBe(400);
    expect(s.count()).toBe(1);
  });

  it('retries 429 up to 5 times using Retry-After', async () => {
    const { sleep, delays } = fakeSleep();
    const s = sequence([
      res(429, { 'Retry-After': '1' }),
      res(429, { 'Retry-After': '2' }),
      res(429),
      res(429),
      res(429),
      res(429),
      res(200),
    ]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_ALL, queue: queue(), sleep });
    expect(s.count()).toBe(6);
    expect(out.kind === 'response' && out.response.status).toBe(429);
    expect(delays).toEqual([1000, 2000, 1000, 1000, 1000]);
  });

  it('treats 529 like 429', async () => {
    const { sleep, delays } = fakeSleep();
    const s = sequence([res(529, { 'Retry-After': '4' }), res(200)]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_RATE_LIMIT_ONLY, queue: queue(), sleep });
    expect(out.kind === 'response' && out.response.status).toBe(200);
    expect(delays).toEqual([4000]);
  });

  it('backs off 0.5/1/2s for 502/503/504 and network errors', async () => {
    const { sleep, delays } = fakeSleep();
    const s = sequence([res(502), new TypeError('net'), res(504), res(200)]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_ALL, queue: queue(), sleep });
    expect(out.kind === 'response' && out.response.status).toBe(200);
    expect(delays).toEqual([500, 1000, 2000]);
  });

  it('returns the thrown cause once transient retries are exhausted', async () => {
    const { sleep } = fakeSleep();
    const cause = new TypeError('offline');
    const s = sequence([cause, cause, cause, cause, res(200)]);
    const out = await executeWithRetry(s.attempt, { policy: RETRY_ALL, queue: queue(), sleep });
    expect(out).toEqual({ kind: 'thrown', cause });
    expect(s.count()).toBe(4);
  });

  it('RETRY_RATE_LIMIT_ONLY never retries transient failures', async () => {
    const { sleep, delays } = fakeSleep();
    const s1 = sequence([new TypeError('net'), res(200)]);
    const out1 = await executeWithRetry(s1.attempt, { policy: RETRY_RATE_LIMIT_ONLY, queue: queue(), sleep });
    expect(out1.kind).toBe('thrown');
    expect(s1.count()).toBe(1);

    const s2 = sequence([res(503), res(200)]);
    const out2 = await executeWithRetry(s2.attempt, { policy: RETRY_RATE_LIMIT_ONLY, queue: queue(), sleep });
    expect(out2.kind === 'response' && out2.response.status).toBe(503);
    expect(s2.count()).toBe(1);
    expect(delays).toEqual([]);
  });

  it('does not retry 429 when rateLimit is disabled', async () => {
    const { sleep } = fakeSleep();
    const s = sequence([res(429), res(200)]);
    const out = await executeWithRetry(s.attempt, {
      policy: { rateLimit: false, transient: true },
      queue: queue(),
      sleep,
    });
    expect(out.kind === 'response' && out.response.status).toBe(429);
  });
});
