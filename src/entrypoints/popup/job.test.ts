import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { err, ok } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { JobState } from '@/lib/messaging/protocol';
import { jobItem } from '@/lib/storage/items';
import { trackJob } from './job';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));
const send = vi.mocked(sendRequest);

const base: JobState = { id: 'j1', status: 'queued', startedAt: '2026-10-18T12:00:00.000Z' };

beforeEach(() => {
  fakeBrowser.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('trackJob', () => {
  it('follows storage.session changes until the job is done, then stops', async () => {
    send.mockResolvedValue(ok(base));
    const onUpdate = vi.fn();
    trackJob('j1', onUpdate, vi.fn(), { pollMs: 60_000 });
    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(base);
    });
    await jobItem('j1').setValue({ ...base, status: 'uploading' });
    await jobItem('j1').setValue({ ...base, status: 'done', pageUrl: 'https://notion.so/x' });
    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenLastCalledWith({ ...base, status: 'done', pageUrl: 'https://notion.so/x' });
    });
    await jobItem('j1').setValue({ ...base, status: 'creating' });
    expect(onUpdate.mock.calls.map(([j]) => (j as JobState).status)).toEqual(['queued', 'uploading', 'done']);
  });

  it('falls back to polling job/get', async () => {
    vi.useFakeTimers();
    send
      .mockResolvedValueOnce(ok(base))
      .mockResolvedValueOnce(ok({ ...base, status: 'creating' }) as never)
      .mockResolvedValueOnce(ok({ ...base, status: 'error', error: { code: 'network', message: 'Offline' } }) as never);
    const onUpdate = vi.fn();
    trackJob('j1', onUpdate, vi.fn(), { pollMs: 1000 });
    await vi.advanceTimersByTimeAsync(2500);
    expect(onUpdate.mock.calls.map(([j]) => (j as JobState).status)).toEqual(['queued', 'creating', 'error']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('reports a lost job when job/get says not-found', async () => {
    send.mockResolvedValue(err('not-found', 'This save is no longer tracked.'));
    const onLost = vi.fn();
    trackJob('j1', vi.fn(), onLost);
    await vi.waitFor(() => {
      expect(onLost).toHaveBeenCalledWith(expect.objectContaining({ code: 'not-found' }));
    });
  });

  it('stop() ignores later updates', async () => {
    send.mockReturnValue(new Promise(() => undefined) as never);
    const onUpdate = vi.fn();
    const stop = trackJob('j1', onUpdate, vi.fn());
    stop();
    await jobItem('j1').setValue({ ...base, status: 'done' });
    await new Promise((r) => setTimeout(r, 10));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
