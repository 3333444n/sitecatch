import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CaptureDeps } from '@/lib/capture/capture';
import { err, ok } from '@/lib/errors';
import { PAGE_OPTIONS_LIMIT, type MessageSender } from '@/lib/messaging/protocol';
import { createNotionClient } from '@/lib/notion/client';
import { jsonResponse, mockFetch } from '@/lib/notion/test-helpers';
import { getPreset, savePreset } from '@/lib/presets/storage';
import { makeCapture, makePreset, resourcesSchema } from '@/lib/presets/testing';
import { getJob } from '@/lib/storage/jobs';
import { authItem, connectionsItem, historyItem, jobItem, lastPresetIdItem, schemaCacheItem } from '@/lib/storage/items';
import { SCHEMA_CACHE_TTL_MS } from '../schema-cache';
import { CONN_ID, fakeClient, makeAuth, makeConnection, makeDeps, NOW, TOKEN } from '../test-helpers';
import { createHandlers } from './index';

const sender: MessageSender = { id: 'test-extension-id' };

beforeEach(() => {
  fakeBrowser.reset();
});

describe('conn/add', () => {
  it('trims the token, stores a connection keyed by workspace id and responds without the token', async () => {
    const { client } = fakeClient();
    client.getMe.mockResolvedValueOnce(
      ok({ botName: 'Bot', workspaceName: 'WS', workspaceId: 'ws-42', maxFileUploadBytes: 5242880 }),
    );
    const { deps } = makeDeps(client);
    const h = createHandlers(deps);
    const res = await h['conn/add']({ type: 'conn/add', token: `  ${TOKEN}\n`, tokenKind: 'personal' }, sender);
    const summary = {
      id: 'ws-42',
      tokenKind: 'personal',
      botName: 'Bot',
      workspaceName: 'WS',
      maxFileUploadBytes: 5242880,
      validatedAt: NOW.toISOString(),
    };
    expect(res).toEqual({ ok: true, data: summary });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(deps.createClient).toHaveBeenCalledWith(TOKEN);
    expect(await connectionsItem.getValue()).toEqual([{ ...summary, token: TOKEN }]);
  });

  it('uses a random id when Notion reports no workspace id', async () => {
    const { client } = fakeClient();
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['conn/add']({ type: 'conn/add', token: TOKEN, tokenKind: 'personal' }, sender);
    expect(res.ok && res.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces the token of an already-connected workspace in place (keeps id and order)', async () => {
    await connectionsItem.setValue([
      makeConnection({ id: 'ws-a', token: 'old-a', workspaceName: 'A' }),
      makeConnection({ id: 'ws-b', token: 'tok-b', workspaceName: 'B' }),
    ]);
    await schemaCacheItem('ds-1').setValue({ schema: resourcesSchema, fetchedAt: 1 });
    const { client } = fakeClient();
    client.getMe.mockResolvedValueOnce(ok({ botName: 'New bot', workspaceName: 'A2', workspaceId: 'ws-a' }));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['conn/add']({ type: 'conn/add', token: 'new-a', tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: true, data: { id: 'ws-a', botName: 'New bot', workspaceName: 'A2' } });
    const stored = await connectionsItem.getValue();
    expect(stored.map((c) => [c.id, c.token])).toEqual([
      ['ws-a', 'new-a'],
      ['ws-b', 'tok-b'],
    ]);
    // Token changed: cached schemas dropped.
    expect(await schemaCacheItem('ds-1').getValue()).toBeNull();
  });

  it('pins unassigned presets to the existing workspace before adding a second one', async () => {
    await connectionsItem.setValue([makeConnection({ id: 'ws-a', token: 'tok-a', workspaceName: 'A' })]);
    await savePreset(makePreset({ id: 'old' }));
    await savePreset(makePreset({ id: 'bound', connectionId: 'ws-x', workspaceName: 'X' }));
    const { client } = fakeClient();
    client.getMe.mockResolvedValueOnce(ok({ botName: 'Bot', workspaceName: 'B', workspaceId: 'ws-b' }));
    const { deps } = makeDeps(client);
    await createHandlers(deps)['conn/add']({ type: 'conn/add', token: 'tok-b', tokenKind: 'personal' }, sender);
    expect(await getPreset('old')).toMatchObject({ ok: true, data: { connectionId: 'ws-a', workspaceName: 'A' } });
    expect(await getPreset('bound')).toMatchObject({ ok: true, data: { connectionId: 'ws-x' } });
    expect((await connectionsItem.getValue()).map((c) => c.id)).toEqual(['ws-a', 'ws-b']);
  });

  it('maps a 401 to invalid-token and stores nothing', async () => {
    const mock = mockFetch([jsonResponse({ object: 'error', status: 401, code: 'unauthorized', message: 'API token is invalid.' }, 401)]);
    const { deps } = makeDeps(fakeClient().client, {
      createClient: (token) => createNotionClient({ token, fetch: mock.fetch, minIntervalMs: 0 }),
    });
    const res = await createHandlers(deps)['conn/add']({ type: 'conn/add', token: TOKEN, tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-token', action: 'open-setup' } });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(await connectionsItem.getValue()).toEqual([]);
  });

  it('requires the host permission before calling Notion', async () => {
    const { client } = fakeClient();
    const { deps } = makeDeps(client, { hasHostPermission: () => Promise.resolve(false) });
    const res = await createHandlers(deps)['conn/add']({ type: 'conn/add', token: TOKEN, tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-host-permission', action: 'grant-permission' } });
    expect(client.getMe).not.toHaveBeenCalled();
  });

  it('rejects an empty token', async () => {
    const { client } = fakeClient();
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['conn/add']({ type: 'conn/add', token: '   ', tokenKind: 'connection' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(client.getMe).not.toHaveBeenCalled();
  });
});

describe('conn/list and conn/remove', () => {
  it('lists connections without tokens', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const h = createHandlers(deps);
    expect(await h['conn/list']({ type: 'conn/list' }, sender)).toEqual({
      ok: true,
      data: { hostPermission: true, connections: [] },
    });
    await connectionsItem.setValue([makeConnection({ maxFileUploadBytes: 100 })]);
    const res = await h['conn/list']({ type: 'conn/list' }, sender);
    expect(res).toEqual({
      ok: true,
      data: {
        hostPermission: true,
        connections: [
          {
            id: CONN_ID,
            tokenKind: 'connection',
            botName: 'Sitecatch',
            workspaceName: 'My workspace',
            validatedAt: '2026-10-18T11:00:00.000Z',
            maxFileUploadBytes: 100,
          },
        ],
      },
    });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it('migrates a v0.1 token on first read, without deleting local:auth', async () => {
    await authItem.setValue(makeAuth({ maxFileUploadBytes: 7 }));
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['conn/list']({ type: 'conn/list' }, sender);
    expect(res).toMatchObject({
      ok: true,
      data: { connections: [{ workspaceName: 'My workspace', tokenKind: 'connection', maxFileUploadBytes: 7 }] },
    });
    expect(await authItem.getValue()).not.toBeNull();
  });

  it('removes one connection and the schema cache, keeping the others', async () => {
    await connectionsItem.setValue([makeConnection({ id: 'a', token: 'ta' }), makeConnection({ id: 'b', token: 'tb' })]);
    await schemaCacheItem('ds-1').setValue({ schema: resourcesSchema, fetchedAt: 1 });
    await browser.storage.session.set({ 'job:keep': { id: 'keep' } });
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['conn/remove']({ type: 'conn/remove', connectionId: 'a' }, sender);
    expect(res).toEqual({ ok: true, data: null });
    expect((await connectionsItem.getValue()).map((c) => c.id)).toEqual(['b']);
    expect(await schemaCacheItem('ds-1').getValue()).toBeNull();
    expect(await browser.storage.session.get('job:keep')).toEqual({ 'job:keep': { id: 'keep' } });
  });

  it('removing the migrated connection also clears local:auth (and it does not come back)', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { deps } = makeDeps(fakeClient().client);
    const h = createHandlers(deps);
    const listed = await h['conn/list']({ type: 'conn/list' }, sender);
    const id = listed.ok ? listed.data.connections[0]?.id : undefined;
    expect(id).toBeDefined();
    await h['conn/remove']({ type: 'conn/remove', connectionId: id ?? '' }, sender);
    expect(await authItem.getValue()).toBeNull();
    expect(await h['conn/list']({ type: 'conn/list' }, sender)).toMatchObject({ ok: true, data: { connections: [] } });
  });

  it('a new token for the migrated workspace replaces it in place and keeps local:auth in step', async () => {
    await authItem.setValue(makeAuth());
    const oldClient = fakeClient().client;
    oldClient.getMe.mockResolvedValue(ok({ botName: 'Bot', workspaceName: 'WS', workspaceId: 'ws-real' }));
    const newClient = fakeClient().client;
    newClient.getMe.mockResolvedValue(ok({ botName: 'Bot 2', workspaceName: 'WS', workspaceId: 'ws-real' }));
    const { deps } = makeDeps(oldClient, {
      createClient: vi.fn((token: string) => (token === TOKEN ? oldClient : newClient)),
    });
    const h = createHandlers(deps);
    await h['conn/list']({ type: 'conn/list' }, sender);
    const [migrated] = await connectionsItem.getValue();
    expect(migrated?.id).toMatch(/^legacy-/);

    await h['conn/add']({ type: 'conn/add', token: 'ntn_new', tokenKind: 'connection' }, sender);
    const stored = await connectionsItem.getValue();
    expect(stored.map((c) => [c.id, c.token])).toEqual([[migrated?.id, 'ntn_new']]);
    expect((await authItem.getValue())?.token).toBe('ntn_new');

    await h['conn/remove']({ type: 'conn/remove', connectionId: migrated?.id ?? '' }, sender);
    expect(await authItem.getValue()).toBeNull();
  });

  it('a token for another workspace is added next to the migrated one', async () => {
    await authItem.setValue(makeAuth());
    const oldClient = fakeClient().client;
    oldClient.getMe.mockResolvedValue(ok({ botName: 'Bot', workspaceName: 'WS', workspaceId: 'ws-old' }));
    const newClient = fakeClient().client;
    newClient.getMe.mockResolvedValue(ok({ botName: 'Bot 2', workspaceName: 'Other', workspaceId: 'ws-new' }));
    const { deps } = makeDeps(oldClient, {
      createClient: vi.fn((token: string) => (token === TOKEN ? oldClient : newClient)),
    });
    const h = createHandlers(deps);
    await h['conn/add']({ type: 'conn/add', token: 'ntn_new', tokenKind: 'connection' }, sender);
    const stored = await connectionsItem.getValue();
    expect(stored).toHaveLength(2);
    expect(stored[1]?.id).toBe('ws-new');
    // Removing the new one leaves the legacy copy alone.
    await h['conn/remove']({ type: 'conn/remove', connectionId: 'ws-new' }, sender);
    expect(await authItem.getValue()).not.toBeNull();
  });

  it('rejects a missing connectionId', async () => {
    const { deps } = makeDeps(fakeClient().client);
    // @ts-expect-error — deliberately malformed
    const res = await createHandlers(deps)['conn/remove']({ type: 'conn/remove' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
  });
});

describe('ds/list and ds/schema', () => {
  it('needs a token', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', connectionId: CONN_ID }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'open-setup' } });
  });

  it('needs a connected workspace', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', connectionId: 'other' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'open-setup' } });
  });

  it('uses the token of the requested connection', async () => {
    await connectionsItem.setValue([makeConnection({ id: 'a', token: 'ta' }), makeConnection({ id: 'b', token: 'tb' })]);
    const { deps } = makeDeps(fakeClient().client);
    const h = createHandlers(deps);
    await h['ds/list']({ type: 'ds/list', connectionId: 'b' }, sender);
    await h['ds/list']({ type: 'ds/list', connectionId: 'b' }, sender);
    await h['ds/list']({ type: 'ds/list', connectionId: 'a' }, sender);
    // One memoized client per connection.
    expect(vi.mocked(deps.createClient).mock.calls).toEqual([['tb'], ['ta']]);
  });

  it('needs the host permission', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { deps } = makeDeps(fakeClient().client, { hasHostPermission: () => Promise.resolve(false) });
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', connectionId: CONN_ID, query: 'x' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-host-permission' } });
  });

  it('lists data sources with the trimmed query', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient();
    client.searchDataSources.mockResolvedValueOnce(ok([{ id: 'ds-1', name: 'Resources' }]));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['ds/list']({ type: 'ds/list', connectionId: CONN_ID, query: ' Res ' }, sender);
    expect(res).toEqual({ ok: true, data: [{ id: 'ds-1', name: 'Resources' }] });
    expect(client.searchDataSources).toHaveBeenCalledWith('Res');
  });

  it('caches schemas for 5 minutes in storage.session; force bypasses the cache', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient(resourcesSchema);
    let now = NOW.getTime();
    const { deps } = makeDeps(client, { now: () => new Date(now) });
    const h = createHandlers(deps);
    const req = { type: 'ds/schema' as const, connectionId: CONN_ID, dataSourceId: 'ds-resources' };

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
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient();
    client.getDataSource.mockResolvedValueOnce(err('db-not-shared', 'share it', { action: 'reshare-db' }));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['ds/schema']({ type: 'ds/schema', connectionId: CONN_ID, dataSourceId: 'x' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'db-not-shared' } });
    expect(await schemaCacheItem('x').getValue()).toBeNull();
  });
});

describe('pages/search', () => {
  const target = { id: 'ds-projects', name: 'Projects', properties: { 'Tt%3D': { id: 'Tt%3D', name: 'Project', type: 'title' as const } }, titlePropertyId: 'Tt%3D' };

  it('needs a connected workspace for the requested connection', async () => {
    const { deps } = makeDeps(fakeClient().client);
    const res = await createHandlers(deps)['pages/search']({ type: 'pages/search', connectionId: CONN_ID, dataSourceId: 'ds-projects' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token' } });
  });

  it('rejects a missing data source id without calling Notion', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient(target);
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['pages/search']({ type: 'pages/search', connectionId: CONN_ID, dataSourceId: '' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(client.searchPages).not.toHaveBeenCalled();
  });

  it('searches the target by its title property with the trimmed query and the result limit', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient(target);
    client.searchPages.mockResolvedValueOnce(ok([{ id: 'p-1', title: 'Kineo Website' }]));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['pages/search'](
      { type: 'pages/search', connectionId: CONN_ID, dataSourceId: 'ds-projects', query: ' Kineo ' },
      sender,
    );
    expect(res).toEqual({ ok: true, data: [{ id: 'p-1', title: 'Kineo Website' }] });
    expect(client.getDataSource).toHaveBeenCalledWith('ds-projects');
    expect(client.searchPages).toHaveBeenCalledWith('ds-projects', {
      titlePropertyId: 'Tt%3D',
      query: 'Kineo',
      limit: PAGE_OPTIONS_LIMIT,
    });
  });

  it('sends no query when it is blank and reuses the cached schema', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient(target);
    const { deps } = makeDeps(client);
    const h = createHandlers(deps);
    await h['pages/search']({ type: 'pages/search', connectionId: CONN_ID, dataSourceId: 'ds-projects', query: '  ' }, sender);
    await h['pages/search']({ type: 'pages/search', connectionId: CONN_ID, dataSourceId: 'ds-projects' }, sender);
    expect(client.getDataSource).toHaveBeenCalledTimes(1);
    expect(client.searchPages).toHaveBeenLastCalledWith('ds-projects', {
      titlePropertyId: 'Tt%3D',
      query: undefined,
      limit: PAGE_OPTIONS_LIMIT,
    });
  });

  it('returns the schema error when the target is not shared', async () => {
    await connectionsItem.setValue([makeConnection()]);
    const { client } = fakeClient();
    client.getDataSource.mockResolvedValueOnce(err('db-not-shared', 'share it', { action: 'reshare-db' }));
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['pages/search']({ type: 'pages/search', connectionId: CONN_ID, dataSourceId: 'x' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'db-not-shared', action: 'reshare-db' } });
    expect(client.searchPages).not.toHaveBeenCalled();
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
    await connectionsItem.setValue([makeConnection()]);
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
    await connectionsItem.setValue([makeConnection()]);
    await savePreset(makePreset({ dedupe: { propertyId: 'notes' } }));
    const { client } = fakeClient(resourcesSchema);
    const { deps } = makeDeps(client);
    await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com' }, sender);
    expect(client.queryByUrl.mock.calls[0]?.[3]).toBe('rich_text');
  });

  it.each(['gone', 'rating'])('skips the query when the dedupe property is unusable (%s)', async (propertyId) => {
    await connectionsItem.setValue([makeConnection()]);
    await savePreset(makePreset({ dedupe: { propertyId } }));
    const { client } = fakeClient(resourcesSchema);
    const { deps } = makeDeps(client);
    const res = await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com' }, sender);
    expect(res).toEqual({ ok: true, data: { matches: [] } });
    expect(client.queryByUrl).not.toHaveBeenCalled();
  });

  it('uses the preset’s own workspace', async () => {
    await connectionsItem.setValue([makeConnection({ id: 'a', token: 'ta' }), makeConnection({ id: 'b', token: 'tb' })]);
    await savePreset(makePreset({ dedupe: { propertyId: 'p%3Aurl' }, connectionId: 'b', workspaceName: 'B' }));
    const { client } = fakeClient(resourcesSchema);
    const { deps } = makeDeps(client);
    await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com' }, sender);
    expect(deps.createClient).toHaveBeenCalledWith('tb');
    expect(client.queryByUrl).toHaveBeenCalled();
  });

  it('returns an actionable error for an unresolved preset', async () => {
    await connectionsItem.setValue([makeConnection({ id: 'a', token: 'ta' })]);
    await savePreset(makePreset({ dedupe: { propertyId: 'p%3Aurl' }, connectionId: 'gone', workspaceName: 'Acme' }));
    const { deps } = makeDeps(fakeClient(resourcesSchema).client);
    const res = await createHandlers(deps)['dup/check']({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com' }, sender);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'edit-preset' } });
    expect(!res.ok && res.error.message).toContain('“Acme”');
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
    await connectionsItem.setValue([makeConnection()]);
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
