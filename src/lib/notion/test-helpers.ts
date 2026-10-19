/**
 * Test-only helpers for mocking `fetch` against the Notion client.
 * (Not imported by production code.)
 */
import { vi } from 'vitest';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
  signal: AbortSignal | null | undefined;
}

export type MockReply = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A fetch mock that answers calls with `replies` in order and records each call. */
export function mockFetch(replies: MockReply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
      signal: init?.signal,
    };
    calls.push(call);
    const reply = queue.shift();
    if (reply === undefined) throw new Error(`Unexpected fetch #${calls.length}: ${url}`);
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(call);
    return reply;
  });
  return { fetch: fn as unknown as typeof fetch, calls, remaining: () => queue.length };
}

export function jsonBody(call: RecordedCall | undefined): unknown {
  if (!call || typeof call.body !== 'string') throw new Error('call has no JSON body');
  return JSON.parse(call.body) as unknown;
}

/** Records requested sleeps and resolves immediately. */
export function fakeSleep() {
  const delays: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { sleep, delays };
}
