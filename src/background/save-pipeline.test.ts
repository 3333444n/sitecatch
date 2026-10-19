import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '@/lib/errors';
import type { JobState } from '@/lib/messaging/protocol';
import type { NotionClient } from '@/lib/notion/client';
import type { NotionCreatePageBody, NotionUpdatePageBody } from '@/lib/notion/types';
import { allResourcesMappings, makeCapture, makePreset, resourcesSchema } from '@/lib/presets/testing';
import type { FormValues, Preset } from '@/lib/presets/types';
import type { AuthState, HistoryEntry } from '@/lib/storage/items';
import { fakeBadge, fakeClient, makeAuth, NOW } from './test-helpers';
import { normalizeDedupeValue, runSavePipeline, type SavePipelineDeps, type SaveRequest } from './save-pipeline';

const PRESET_BASE: Preset = makePreset({
  mappings: allResourcesMappings().filter((m) => ['title', 'p%3Aurl', 'notes'].includes(m.propertyId)),
  dedupe: { propertyId: 'p%3Aurl' },
});

const VALUES: FormValues = {
  title: { kind: 'text', value: 'Example — OG' },
  'p%3Aurl': { kind: 'text', value: 'https://Example.com/article/?utm_source=x#top' },
  notes: { kind: 'text', value: 'A description' },
};

function setup(opts: { preset?: Preset; auth?: AuthState; client?: ReturnType<typeof fakeClient> } = {}) {
  const fc = opts.client ?? fakeClient(resourcesSchema);
  const preset = opts.preset ?? PRESET_BASE;
  const jobs: Partial<JobState>[] = [];
  const history: HistoryEntry[] = [];
  const lastPreset: string[] = [];
  const { badge, calls: badgeCalls } = fakeBadge();
  const deps: SavePipelineDeps = {
    requireClient: vi.fn(() => Promise.resolve(ok({ auth: opts.auth ?? makeAuth(), client: fc.client }))),
    loadPreset: vi.fn((id: string): Promise<Result<Preset>> =>
      Promise.resolve(id === preset.id ? ok(preset) : err('not-found', 'gone')),
    ),
    fetchSchema: vi.fn((client: NotionClient, id: string) => client.getDataSource(id)),
    updateJob: vi.fn((_id: string, patch: Partial<JobState>) => {
      jobs.push(patch);
      fc.log.push(`job:${patch.status ?? '?'}`);
      return Promise.resolve();
    }),
    addHistory: vi.fn((entry: HistoryEntry) => {
      history.push(entry);
      return Promise.resolve();
    }),
    setLastPresetId: vi.fn((id: string) => {
      lastPreset.push(id);
      return Promise.resolve();
    }),
    compress: vi.fn(() => Promise.reject(new Error('compress not expected'))),
    badge,
    now: () => NOW,
    sleep: vi.fn(() => Promise.resolve()),
  };
  return { deps, ...fc, jobs, history, lastPreset, badgeCalls, preset };
}

function request(overrides: Partial<SaveRequest> = {}): SaveRequest {
  return { presetId: 'preset-1', values: VALUES, capture: makeCapture(), mode: { kind: 'create' }, ...overrides };
}

function createBody(client: ReturnType<typeof fakeClient>['client']): NotionCreatePageBody {
  const body = client.createPage.mock.calls[0]?.[0];
  if (!body) throw new Error('createPage not called');
  return body;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runSavePipeline — create', () => {
  it('creates the page, records job/history/lastPresetId and shows the ✓ badge', async () => {
    const t = setup();
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res.ok).toBe(true);
    expect(t.log).toEqual(['getDataSource', 'job:creating', 'createPage', 'job:done']);
    expect(t.jobs.at(-1)).toEqual({ status: 'done', pageUrl: 'https://www.notion.so/page1' });
    expect(t.history).toEqual([
      {
        pageId: 'page-1',
        pageUrl: 'https://www.notion.so/page1',
        title: 'Example — OG',
        sourceUrl: 'https://example.com/article?utm_source=x',
        presetId: 'preset-1',
        presetName: 'Resources',
        savedAt: NOW.toISOString(),
      },
    ]);
    expect(t.lastPreset).toEqual(['preset-1']);
    expect(t.badgeCalls).toEqual(['clear', 'success']);
    const body = createBody(t.client);
    expect(body.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-resources' });
    expect(body.children).toBeUndefined();
  });

  it('writes the normalized URL to the dedupe property only', async () => {
    const preset = makePreset({
      mappings: [
        ...PRESET_BASE.mappings,
        { propertyId: 'notes', propertyName: 'Notes', propertyType: 'rich_text', source: { kind: 'extractor', extractor: 'url' }, editableInPopup: false },
      ],
      dedupe: { propertyId: 'p%3Aurl' },
    });
    const t = setup({ preset });
    const raw = 'https://Example.com/article/?utm_source=x#top';
    await runSavePipeline('job-1', request({ values: { ...VALUES, notes: { kind: 'text', value: raw } } }), t.deps);
    const props = createBody(t.client).properties ?? {};
    expect(props['p%3Aurl']).toEqual({ url: 'https://example.com/article' });
    expect(props.notes).toEqual({ rich_text: [{ type: 'text', text: { content: raw } }] });
  });

  it('fetches a fresh schema and blocks on preset issues without writing anything', async () => {
    const preset = makePreset({
      mappings: [{ propertyId: 'gone', propertyName: 'Gone', propertyType: 'url', source: { kind: 'extractor', extractor: 'url' }, editableInPopup: false }],
    });
    const t = setup({ preset });
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(t.deps.fetchSchema).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('preset-invalid');
    expect(res.error.action).toBe('edit-preset');
    expect(res.error.message).toContain('“Gone”');
    expect(t.client.createPage).not.toHaveBeenCalled();
    expect(t.client.uploadFile).not.toHaveBeenCalled();
    expect(t.jobs.at(-1)).toMatchObject({ status: 'error', error: { code: 'preset-invalid' } });
    expect(t.badgeCalls).toEqual(['clear', 'error']);
    expect(t.history).toEqual([]);
  });

  it('fails with the auth error when there is no token', async () => {
    const t = setup();
    t.deps.requireClient = () => Promise.resolve(err('no-token', 'Connect first', { action: 'open-setup' }));
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token' } });
    expect(t.jobs.at(-1)).toMatchObject({ status: 'error' });
  });

  it('surfaces non-ambiguous create errors as-is', async () => {
    const t = setup();
    t.client.createPage.mockResolvedValueOnce(err('validation', 'bad', { action: 'edit-preset' }));
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(t.client.queryByUrl).not.toHaveBeenCalled();
  });
});

describe('runSavePipeline — screenshot', () => {
  const shotPreset = makePreset({
    mappings: PRESET_BASE.mappings,
    screenshot: { filesPropertyId: 'shots', bodyImage: true },
    cover: 'screenshot',
  });

  it('uploads once before creating and reuses the id for files, cover and body image', async () => {
    const t = setup({ preset: shotPreset });
    await runSavePipeline('job-1', request(), t.deps);
    expect(t.log).toEqual(['getDataSource', 'job:uploading', 'uploadFile', 'job:creating', 'createPage', 'job:done']);
    expect(t.client.uploadFile).toHaveBeenCalledTimes(1);
    const body = createBody(t.client);
    expect(body.properties?.shots).toEqual({
      files: [{ type: 'file_upload', file_upload: { id: 'upload-1' }, name: 'screenshot.jpg' }],
    });
    expect(body.cover).toEqual({ type: 'file_upload', file_upload: { id: 'upload-1' } });
    expect(body.children).toEqual([
      { object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: 'upload-1' } } },
    ]);
  });

  it('also uploads once when a files mapping uses the screenshot extractor', async () => {
    const preset = makePreset({
      mappings: [...PRESET_BASE.mappings, ...allResourcesMappings().filter((m) => m.propertyId === 'shots')],
      cover: 'screenshot',
    });
    const t = setup({ preset });
    await runSavePipeline('job-1', request({ values: { ...VALUES, shots: { kind: 'files', value: [{ kind: 'screenshot' }] } } }), t.deps);
    expect(t.client.uploadFile).toHaveBeenCalledTimes(1);
    expect(createBody(t.client).properties?.shots).toEqual({
      files: [{ type: 'file_upload', file_upload: { id: 'upload-1' }, name: 'screenshot.jpg' }],
    });
  });

  it('passes the workspace limit to the upload and recompresses when the screenshot is too big', async () => {
    const t = setup({ preset: shotPreset, auth: makeAuth({ maxFileUploadBytes: 2 }) });
    const small = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    t.deps.compress = vi.fn(() =>
      Promise.resolve(ok({ blob: small, dataUrl: 'data:image/jpeg;base64,AQ==', width: 1, height: 1, bytes: 1, reducedToFit: true })),
    );
    await runSavePipeline('job-1', request(), t.deps);
    expect(t.deps.compress).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA', { maxBytes: 2 });
    const [blob, name, type, options] = t.client.uploadFile.mock.calls[0] ?? [];
    expect(blob).toBe(small);
    expect(name).toBe('screenshot.jpg');
    expect(type).toBe('image/jpeg');
    expect(options).toEqual({ maxBytes: 2 });
  });

  it('defaults the limit to 5 MiB', async () => {
    const t = setup({ preset: shotPreset });
    await runSavePipeline('job-1', request(), t.deps);
    expect(t.client.uploadFile.mock.calls[0]?.[3]).toEqual({ maxBytes: 5 * 1024 * 1024 });
    expect(t.deps.compress).not.toHaveBeenCalled();
  });

  it('continues without the screenshot when the upload is too large', async () => {
    const t = setup({ preset: shotPreset });
    t.client.uploadFile.mockResolvedValueOnce(err('upload-too-large', 'too big'));
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.warnings.join(' ')).toMatch(/without it/);
    const body = createBody(t.client);
    expect(body.cover).toBeUndefined();
    expect(body.children).toBeUndefined();
    expect(body.properties?.shots).toBeUndefined();
    expect(t.jobs.at(-1)).toMatchObject({ status: 'done' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('continues without the screenshot when recompression cannot fit it', async () => {
    const t = setup({ preset: shotPreset, auth: makeAuth({ maxFileUploadBytes: 1 }) });
    t.deps.compress = vi.fn(() => Promise.resolve(err('upload-too-large', 'too big')));
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res.ok).toBe(true);
    expect(t.client.uploadFile).not.toHaveBeenCalled();
  });

  it('fails the job on other upload errors', async () => {
    const t = setup({ preset: shotPreset });
    t.client.uploadFile.mockResolvedValueOnce(err('network', 'offline', { action: 'retry' }));
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(t.client.createPage).not.toHaveBeenCalled();
  });

  it('saves without the screenshot when the capture has none', async () => {
    const t = setup({ preset: shotPreset });
    const capture = makeCapture();
    delete capture.values.screenshot;
    const res = await runSavePipeline('job-1', request({ capture }), t.deps);
    expect(res.ok).toBe(true);
    expect(t.client.uploadFile).not.toHaveBeenCalled();
  });
});

describe('runSavePipeline — update', () => {
  it('PATCHes properties + cover + icon and never sends children', async () => {
    const preset = makePreset({
      mappings: PRESET_BASE.mappings,
      screenshot: { filesPropertyId: null, bodyImage: true },
      cover: 'screenshot',
      icon: 'favicon',
    });
    const t = setup({ preset });
    const res = await runSavePipeline('job-1', request({ mode: { kind: 'update', pageId: 'existing' } }), t.deps);
    expect(res.ok).toBe(true);
    expect(t.client.createPage).not.toHaveBeenCalled();
    const [pageId, body] = t.client.updatePage.mock.calls[0] ?? [];
    expect(pageId).toBe('existing');
    const patch = body as NotionUpdatePageBody & { children?: unknown };
    expect(patch.children).toBeUndefined();
    expect(patch.cover).toEqual({ type: 'file_upload', file_upload: { id: 'upload-1' } });
    expect(patch.icon).toEqual({ type: 'external', external: { url: 'https://example.com/favicon.ico' } });
    expect(t.jobs.at(-1)).toEqual({ status: 'done', pageUrl: 'https://www.notion.so/existing' });
  });
});

describe('runSavePipeline — ambiguous create failure', () => {
  const networkErr = err('network', 'Notion took too long to respond.', { action: 'retry', detail: 'timeout' });

  it('treats a page found by the dup re-check (edited since the job started) as success', async () => {
    const t = setup();
    t.client.createPage.mockResolvedValueOnce(networkErr);
    t.client.queryByUrl.mockResolvedValueOnce(
      ok([{ pageId: 'p-new', url: 'https://www.notion.so/pnew', title: 'Example', lastEditedTime: '2026-10-18T12:00:00.000Z' }]),
    );
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: true, data: { recovered: true, page: { id: 'p-new' } } });
    expect(t.client.createPage).toHaveBeenCalledTimes(1);
    expect(t.client.queryByUrl).toHaveBeenCalledWith(
      'ds-resources',
      'p%3Aurl',
      ['https://example.com/article'],
      'url',
    );
    expect(t.deps.sleep).toHaveBeenCalled();
    expect(t.jobs.at(-1)).toEqual({ status: 'done', pageUrl: 'https://www.notion.so/pnew' });
    expect(t.badgeCalls).toEqual(['clear', 'success']);
  });

  it('ignores old matches and fails with retry', async () => {
    const t = setup();
    t.client.createPage.mockResolvedValueOnce(networkErr);
    t.client.queryByUrl.mockResolvedValueOnce(
      ok([{ pageId: 'p-old', url: 'https://www.notion.so/pold', title: 'Example', lastEditedTime: '2026-10-01T09:00:00.000Z' }]),
    );
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: false, error: { code: 'network', action: 'retry' } });
    expect(t.client.createPage).toHaveBeenCalledTimes(1);
    expect(t.badgeCalls).toEqual(['clear', 'error']);
  });

  it('in duplicate mode, ignores pages that matched before the create', async () => {
    const t = setup();
    const existing = { pageId: 'p-existing', url: 'https://www.notion.so/pe', title: 'Example', lastEditedTime: '2026-10-18T11:59:00.000Z' };
    t.client.queryByUrl.mockResolvedValueOnce(ok([existing])).mockResolvedValueOnce(ok([existing]));
    t.client.createPage.mockResolvedValueOnce(networkErr);
    const res = await runSavePipeline('job-1', request({ mode: { kind: 'duplicate' } }), t.deps);
    expect(res).toMatchObject({ ok: false, error: { action: 'retry' } });
    // mockResolvedValueOnce bypasses the call log, so check order via vitest's call order.
    expect(t.client.queryByUrl).toHaveBeenCalledTimes(2);
    const [before, after] = t.client.queryByUrl.mock.invocationCallOrder;
    const create = t.client.createPage.mock.invocationCallOrder[0] ?? 0;
    expect(before).toBeLessThan(create);
    expect(after).toBeGreaterThan(create);
  });

  it('fails with retry when the preset has no dedupe property', async () => {
    const t = setup({ preset: makePreset({ mappings: PRESET_BASE.mappings }) });
    t.client.createPage.mockResolvedValueOnce(networkErr);
    const res = await runSavePipeline('job-1', request(), t.deps);
    expect(res).toMatchObject({ ok: false, error: { code: 'network', action: 'retry' } });
    expect(t.client.queryByUrl).not.toHaveBeenCalled();
  });
});

describe('normalizeDedupeValue', () => {
  it('leaves values alone without a dedupe property', () => {
    const preset = makePreset();
    expect(normalizeDedupeValue(preset, VALUES)).toEqual({ values: VALUES, dedupeUrl: null });
  });
});
