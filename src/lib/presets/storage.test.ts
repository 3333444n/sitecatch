import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { presetIndexItem, presetItem } from '@/lib/storage/items';
import {
  createEmptyPreset,
  deletePreset,
  getPreset,
  listPresets,
  reorderPresets,
  savePreset,
  watchPresets,
} from './storage';
import { favWebsitesSchema, makePreset, resourcesSchema } from './testing';

describe('preset storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('saves, lists in index order, gets and deletes', async () => {
    const now = new Date('2026-05-05T00:00:00Z');
    const a = await savePreset(makePreset({ id: 'a', name: 'A' }), now);
    expect(a.ok && a.data.preset.updatedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(a.ok && a.data.nearQuota).toBe(false);
    await savePreset(makePreset({ id: 'b', name: 'B' }));
    await savePreset(makePreset({ id: 'a', name: 'A2' }));
    expect(await presetIndexItem.getValue()).toEqual(['a', 'b']);
    expect((await listPresets()).map((p) => p.name)).toEqual(['A2', 'B']);

    const got = await getPreset('b');
    expect(got.ok && got.data.name).toBe('B');

    await deletePreset('a');
    expect((await listPresets()).map((p) => p.id)).toEqual(['b']);
    const missing = await getPreset('a');
    expect(!missing.ok && missing.error.code).toBe('not-found');
  });

  it('skips damaged entries', async () => {
    await savePreset(makePreset({ id: 'ok' }));
    await presetIndexItem.setValue(['ok', 'bad', 'gone']);
    await fakeBrowser.storage.sync.set({ 'preset:bad': { schemaVersion: 1, id: 'bad' } });
    expect((await listPresets()).map((p) => p.id)).toEqual(['ok']);
  });

  it('reorders, ignoring unknown ids and keeping unlisted ones at the end', async () => {
    for (const id of ['a', 'b', 'c']) await savePreset(makePreset({ id }));
    await reorderPresets(['c', 'zzz', 'a']);
    expect(await presetIndexItem.getValue()).toEqual(['c', 'a', 'b']);
  });

  it('warns near the quota and rejects over 8 KB', async () => {
    const big = (n: number) =>
      makePreset({
        id: 'big',
        mappings: [
          {
            propertyId: 'notes',
            propertyName: 'Notes',
            propertyType: 'rich_text',
            source: { kind: 'static', value: { kind: 'text', value: 'x'.repeat(n) } },
            editableInPopup: false,
          },
        ],
      });
    const near = await savePreset(big(7300));
    expect(near.ok && near.data.nearQuota).toBe(true);
    const over = await savePreset(big(8200));
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe('validation');
      expect(over.error.action).toBe('edit-preset');
    }
    const stored = await presetItem('big').getValue();
    expect(stored?.mappings[0]?.source).toMatchObject({ kind: 'static' });
  });

  it('notifies watchers on change', async () => {
    const cb = vi.fn();
    const unwatch = watchPresets(cb);
    await savePreset(makePreset({ id: 'w' }));
    await vi.waitFor(() => {
      expect(cb).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'w' })]);
    });
    unwatch();
    cb.mockClear();
    await savePreset(makePreset({ id: 'x' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('creates an empty preset with title + url defaults', () => {
    const p = createEmptyPreset({ id: 'ds-resources', name: 'Resources' }, resourcesSchema);
    expect(p.id).toMatch(/[0-9a-f-]{36}/);
    expect(p.dataSourceId).toBe('ds-resources');
    expect(p.mappings).toEqual([
      expect.objectContaining({
        propertyId: 'title',
        propertyType: 'title',
        source: { kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] },
      }),
      expect.objectContaining({ propertyId: 'p%3Aurl', propertyType: 'url', source: { kind: 'extractor', extractor: 'url' } }),
    ]);
    expect(p.dedupe.propertyId).toBe('p%3Aurl');

    const fav = createEmptyPreset({ id: 'ds-fav', name: 'Fav websites' }, favWebsitesSchema);
    expect(fav.mappings.map((m) => m.propertyId)).toEqual(['nm', 'link']);
    expect(fav.dedupe.propertyId).toBe('link');
  });

  it('creates a preset without dedupe when there is no url property', () => {
    const schema = { id: 'x', name: 'X', titlePropertyId: 't', properties: { t: { id: 't', name: 'T', type: 'title' as const } } };
    const p = createEmptyPreset({ id: 'x', name: 'X' }, schema);
    expect(p.mappings).toHaveLength(1);
    expect(p.dedupe.propertyId).toBeNull();
  });
});
