import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/lib/errors';
import { sendRequest } from './client';
import { isRequest } from './protocol';

describe('sendRequest', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns the Result sent back by the background', async () => {
    // fakeBrowser only supports the sendResponse + `return true` style.
    fakeBrowser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (response: unknown) => void) => {
        if (isRequest(message) && message.type === 'job/get') {
          sendResponse(ok({ id: message.jobId, status: 'done', startedAt: '2026-01-01T00:00:00Z' }));
          return true;
        }
        return undefined;
      },
    );
    const res = await sendRequest({ type: 'job/get', jobId: 'j1' });
    expect(res).toEqual({ ok: true, data: { id: 'j1', status: 'done', startedAt: '2026-01-01T00:00:00Z' } });
  });

  it('returns an AppError when nothing answers', async () => {
    const res = await sendRequest({ type: 'auth/status' });
    expect(res.ok).toBe(false);
  });
});

describe('isRequest', () => {
  it('accepts known types only', () => {
    expect(isRequest({ type: 'auth/status' })).toBe(true);
    expect(isRequest({ type: 'nope' })).toBe(false);
    expect(isRequest(null)).toBe(false);
  });
});
