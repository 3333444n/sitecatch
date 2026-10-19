import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addHistoryEntry, clearHistory, listHistory } from './history';
import type { HistoryEntry } from './items';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, settingsItem } from './items';
import { createJob, getJob, updateJob, watchJob } from './jobs';
import { getLastPresetId, getSettings, setLastPresetId, setSettings } from './settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings', () => {
  it('returns defaults, merges patches and fills missing keys', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await setSettings({ captureDelayMs: 500 })).toEqual({ ...DEFAULT_SETTINGS, captureDelayMs: 500 });
    await settingsItem.setValue({ captureDelayMs: 100 } as never);
    expect(await getSettings()).toEqual({ captureDelayMs: 100, jpegQuality: DEFAULT_SETTINGS.jpegQuality });
  });

  it('clamps out-of-range values', async () => {
    expect(await setSettings({ captureDelayMs: -5, jpegQuality: 7 })).toEqual({ captureDelayMs: 0, jpegQuality: 1 });
  });

  it('stores the last preset id', async () => {
    expect(await getLastPresetId()).toBeNull();
    await setLastPresetId('p1');
    expect(await getLastPresetId()).toBe('p1');
  });
});

describe('history', () => {
  const entry = (i: number): HistoryEntry => ({
    pageId: `page-${i}`,
    pageUrl: `https://notion.so/${i}`,
    title: `T${i}`,
    sourceUrl: `https://e.com/${i}`,
    presetId: 'p',
    presetName: 'P',
    savedAt: new Date(i * 1000).toISOString(),
  });

  it('adds most-recent first and caps at HISTORY_LIMIT', async () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) await addHistoryEntry(entry(i));
    const list = await listHistory();
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0]?.pageId).toBe(`page-${HISTORY_LIMIT + 4}`);
  });

  it('replaces an entry for the same page (update mode)', async () => {
    await addHistoryEntry(entry(1));
    await addHistoryEntry(entry(2));
    await addHistoryEntry({ ...entry(1), title: 'updated' });
    expect((await listHistory()).map((e) => e.title)).toEqual(['updated', 'T2']);
    await clearHistory();
    expect(await listHistory()).toEqual([]);
  });
});

describe('jobs', () => {
  it('creates, updates, gets and watches jobs', async () => {
    const job = await createJob({ presetName: 'Resources' }, new Date('2026-01-01T00:00:00Z'));
    expect(job).toMatchObject({ status: 'queued', presetName: 'Resources', startedAt: '2026-01-01T00:00:00.000Z' });

    const cb = vi.fn();
    const unwatch = watchJob(job.id, cb);
    const updated = await updateJob(job.id, { status: 'done', pageUrl: 'https://notion.so/x' });
    expect(updated).toMatchObject({ id: job.id, status: 'done', pageUrl: 'https://notion.so/x' });
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
    });
    unwatch();

    const got = await getJob(job.id);
    expect(got.ok && got.data.status).toBe('done');
  });

  it('handles unknown jobs', async () => {
    expect(await updateJob('nope', { status: 'error' })).toBeNull();
    const got = await getJob('nope');
    expect(!got.ok && got.error.code).toBe('not-found');
  });
});
