import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CaptureDeps } from '@/lib/capture/capture';
import { err, ok } from '@/lib/errors';
import type { MessageSender } from '@/lib/messaging/protocol';
import { createNotionClient } from '@/lib/notion/client';
import { jsonResponse, mockFetch } from '@/lib/notion/test-helpers';
import { savePreset } from '@/lib/presets/storage';
import { makeCapture, makePreset, resourcesSchema } from '@/lib/presets/testing';
import { getJob } from '@/lib/storage/jobs';
import { authItem, historyItem, jobItem, lastPresetIdItem, schemaCacheItem } from '@/lib/storage/items';
import { SCHEMA_CACHE_TTL_MS } from '../schema-cache';
import { fakeClient, makeAuth, makeDeps, NOW, TOKEN } from '../test-helpers';
import { createHandlers } from './index';

const sender: MessageSender = { id: 'test-extension-id' };

beforeEach(() => {
  fakeBrowser.reset();
});

describe('auth/validate', () => {
  it('trims the token, stores AuthState and responds without the token', async () => {
    const { client } = fakeClient();
    client.getMe.mockResolvedValueOnce(ok({ botName: 'Bot', workspaceName: 'WS', maxFileUploadBytes: 5242880 }));
    const { deps } = makeDeps(client);
    const h = createHandlers(deps);
    const res = await h['auth/validate']({ type: 'auth/validate', token: `  ${TOKEN}\n`, tokenKind: 'personal' }, sender);
    expect(res).toEqual({ ok: true, data: { botName: 'Bot', workspaceName: 'WS', maxFileUploadBytes: 5242880 } });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(deps.createClient).toHaveBeenCalledWith(TOKEN);
    expect(await authItem.getValue()).toEqual({
      token: TOKEN,
      tokenKind: 'personal',
      botName: 'Bot',
      workspaceName: 'WS',
      maxFileUploadBytes: 5242880,
      validatedAt: NOW.toISOString(),
    });
  });

  it('maps a 401 to invalid-token and stores nothing', async () => {
    const mock = mockFetch([jsonResponse({ object: 'error', status: 401, code: 'unauthorized', message: 'API token is invalid.' }, 401)]);
    const { deps } = makeDeps(fakeClient().client, {
      createClient: (token) => createNotionClient({ token, fetch: mock.fetch, minIntervalMs: 0 }),
    });
    const res = await createHandlers(deps)['auth/validate']({ type: 'auth/validate', token: TOKEN, tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-token', action: 'open-setup' } });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(await authItem.getValue()).toBeNull();
  });

  it('requires the host permission before calling Notion', async () => {
    const { client } = fakeClient();
    const { deps } = makeDeps(client, { hasHostPermission: () => Promise.resolve(false) });
    const res = await createHandlers(deps)['auth/validate']({ type: 'auth/validate', token: TOKEN, tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-host-permission', action: 'grant-permission' } });
    expect(client.getMe).not.toHaveBeenCalled();
  });

  it('rejects an empty token', async () => {
    const { client } = fakeClient();
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['auth/validate']({ type: 'auth/validate', token: '   ', tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(client.getMe).not.toHaveBeenCalled();
  });
});

describe('auth/status and auth/clear', () => {
  it('reports status without the token', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const h = createHandlers(deps);
    expect(await h['auth/status']({ type: 'auth/status' }, sender)).toEqual({ ok: true, data: { hasToken: false, hostPermission: true } });
    await authItem.setValue(makeAuth({ maxFileUploadBytes: 100 }));
    const res = await h['auth/status']({ type: 'auth/status' }, sender);
    expect(res).toEqual({
      ok: true,
      data: { hasToken: true, tokenKind: 'connection', hostPermission: true, workspaceName: 'My workspace', maxFileUploadBytes: 100 },
    });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it('clears the token and the schema cache', async () => {
    await authItem.setValue(makeAuth());
    await schemaCacheItem('ds-1').setValue({ schema: resourcesSchema, fetchedAt: 1 });
    await browser.storage.session.set({ 'job:keep': { id: 'keep' } });
    const { deps } = makeDeps(fakeClient().client);
    expect(await createHandlers(deps)['auth/clear']({ type: 'auth/clear' }, sender)).toEqual({ ok: true, data: null });
    expect(await authItem.getValue()).toBeNull();
    expect(await schemaCacheItem('ds-1').getValue()).toBeNull();
    expect(await browser.storage.session.get('job:keep')).toEqual({ 'job:keep': { id: 'keep' } });
  });
});

describe('ds/list and ds/schema', () => {
  it('needs a token', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'open-setup' } });
  });

  it('needs the host permission', async () => {
    await authItem.setValue(makeAuth());
    const { deps } = makeDeps(fakeClient().client, { hasHostPermission: () => Promise.resolve(false) });
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', query: 'x' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-host-permission' } });
  });

  it('lists data sources with the trimmed query', async () => {
    await authItem.setValue(makeAuth());
    const { client } = fakeClient();
    client.searchDataSources.mockResolvedValueOnce(ok([{ id: 'ds-1', name: 'Resources' }]));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', query: ' Res ' }, sender);
    expect(res).toEqual({ ok: true, data: [{ id: 'ds-1', name: 'Resources' }] });
    expect(client.searchDataSources).toHaveBeenCalledWith('Res');
  });

  it('caches schemas for 5 minutes in storage.session; force bypasses the cache', async () => {
    await authItem.setValue(makeAuth());
    const { client } = fakeClient(resourcesSchema);
    let now = NOW.getTime();
    const { deps } = makeDeps(client, { now: () => new Date(now) });
    const h = createHandlers(deps);
    const req = { type: 'ds/schema' as const, dataSourceId: 'ds-resources' };

    expect(await h['ds/schema'](req, sender)).toEqual({ ok: true, data: resourcesSchema });
    expect(await schemaCacheItem('ds-resources').getValue()).toEqual({ schema: resourcesSchema, fetchedAt: now });
    now += SCHEMA_CACHE_TTL_MS - 1;
    await h['ds/schema'](req, sender);
    expect(client.getDataSource).toHaveBeenCalledTimes(1);
    await h['ds/schema']({ ...req, force: true }, sender);
    expect(client.getDataSource).toHaveBeenCalledTimes(2);
    now += SCHEMA_CACHE_TTL_MS;
    await h['ds/schema'](req, sender);
    expect(client.getDataSource).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures', async () => {
    await authItem.setValue(makeAuth());
    const { client } = fakeClient();
    client.getDataSource.mockResolvedValueOnce(err('db-not-shared', 'share it', { action: 'reshare-db' }));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['ds/schema']({ type: 'ds/schema', dataSourceId: 'x' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'db-not-shared' } });
    expect(await schemaCacheItem('x').getValue()).toBeNull();
  });
});

describe('capture/run', () => {
  it('captures the tab with the stored settings', async () => {
    const captureDeps: CaptureDeps = {
      executeScript: vi.fn(() => Promise.reject(new Error('no'))),
      captureVisibleTab: vi.fn(() => Promise.reject(new Error('no'))),
      sleep: () => Promise.resolve(),
      now: () => NOW,
    };
    const { deps } = makeDeps(fakeClient().client, {
      getTab: (id) => Promise.resolve({ id, windowId: 1, url: 'about:addons', title: 'Add-ons' }),
      captureDeps: () => captureDeps,
    });
    const res = await createHandlers(deps)['capture/run']({ type: 'capture/run', tabId: 7 }, sender);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ tabId: 7, restricted: true, url: 'about:addons' });
  });

  it('reports a closed tab', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['capture/run']({ type: 'capture/run', tabId: 7 }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

describe('dup/check', () => {
  const preset = makePreset({ dedupe: { propertyId: 'p%3Aurl' } });

  it('returns no matches without a dedupe property (and makes no request)', async () => {
    await savePreset(makePreset());
    const { client } = fakeClient(resourcesSchema);
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://a.example' }, sender);
    expect(res).toEqual({ ok: true, data: { matches: [] } });
    expect(client.queryByUrl).not.toHaveBeenCalled();
  });

  it('queries the dedupe property with normalized + raw URL variants', async () => {
    await authItem.setValue(makeAuth());
    await savePreset(preset);
    const { client } = fakeClient(resourcesSchema);
    const match = { pageId: 'p1', url: 'https://www.notion.so/p1', title: 'Example', lastEditedTime: '2026-10-01T00:00:00.000Z' };
    client.queryByUrl.mockResolvedValueOnce(ok([match]));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['dup/check'](
      { type: 'dup/check', presetId: 'preset-1', url: 'https://example.com/article/?utm_source=x' },
      sender,
    );
    expect(res).toEqual({ ok: true, data: { matches: [match] } });
    expect(client.queryByUrl).toHaveBeenCalledWith(
      'ds-resources',
      'p%3Aurl',
      ['https://example.com/article', 'https://example.com/article/?utm_source=x'],
      'url',
    );
  });

  it('uses the live property type (rich_text)', async () => {
    await authItem.setValue(makeAuth());
    await savePreset(makePreset({ dedupe: { propertyId: 'notes' } }));
    const { client } = fakeClient(resourcesSchema);
    const { deps } = makeDeps(client);
    await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com' }, sender);
    expect(client.queryByUrl.mock.calls[0]?.[3]).toBe('rich_text');
  });

  it('reports a missing preset', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'nope', url: 'https://a' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

describe('save/start and job/get', () => {
  it('responds with a jobId before the pipeline finishes, then the job completes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await authItem.setValue(makeAuth());
    await savePreset(makePreset({ dedupe: { propertyId: 'p%3Aurl' }, mappings: [
      { propertyId: 'title', propertyName: 'Name', propertyType: 'title', source: { kind: 'extractor', extractor: 'title' }, editableInPopup: true },
    ] }));
    const { client } = fakeClient(resourcesSchema);
    let release: () => void = () => undefined;
    client.createPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(ok({ id: 'page-9', url: 'https://www.notion.so/page9' }));
          };
        }),
    );
    const { deps, detached } = makeDeps(client);
    const h = createHandlers(deps);
    const res = await h['save/start'](
      {
        type: 'save/start',
        presetId: 'preset-1',
        values: { title: { kind: 'text', value: 'Hello' } },
        capture: makeCapture(),
        mode: { kind: 'create' },
      },
      sender,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { jobId } = res.data;
    const pending = await h['job/get']({ type: 'job/get', jobId }, sender);
    expect(pending.ok && pending.data.status).not.toBe('done');
    expect(pending.ok && pending.data.presetName).toBe('Resources');

    // Let the pipeline reach createPage, then finish it.
    await vi.waitFor(() => {
      expect(client.createPage).toHaveBeenCalled();
    });
    release();
    await Promise.all(detached);

    const done = await getJob(jobId);
    expect(done).toMatchObject({ ok: true, data: { status: 'done', pageUrl: 'https://www.notion.so/page9' } });
    expect((await historyItem.getValue())[0]).toMatchObject({ pageId: 'page-9', title: 'Hello', presetId: 'preset-1' });
    expect(await lastPresetIdItem.getValue()).toBe('preset-1');
    // The pipeline always refetches the schema and refreshes the cache.
    expect(await schemaCacheItem('ds-resources').getValue()).not.toBeNull();
  });

  it('rejects a malformed request without creating a job', async () => {
    const { deps, detached } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['save/start'](
      // @ts-expect-error — deliberately malformed
      { type: 'save/start', presetId: 'p', values: {}, capture: makeCapture(), mode: { kind: 'update' } },
      sender,
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(detached).toHaveLength(0);
  });

  it('reports a missing preset immediately', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['save/start'](
      { type: 'save/start', presetId: 'nope', values: {}, capture: makeCapture(), mode: { kind: 'create' } },
      sender,
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('job/get returns not-found for unknown jobs', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['job/get']({ type: 'job/get', jobId: 'missing' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(await jobItem('missing').getValue()).toBeNull();
  });
});
