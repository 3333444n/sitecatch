/** Test-only helpers for background tests (not imported by app code). */
import { vi } from 'vitest';
import { ok } from '@/lib/errors';
import type { NotionClient } from '@/lib/notion/client';
import type { DataSourceSchema } from '@/lib/notion/types';
import type { AuthState } from '@/lib/storage/items';
import type { Badge } from './badge';
import type { BackgroundDeps } from './context';

export const TOKEN = 'ntn_testtoken0123456789abcdef';

export function makeAuth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    token: TOKEN,
    tokenKind: 'connection',
    botName: 'Sitecatch',
    workspaceName: 'My workspace',
    validatedAt: '2026-10-18T11:00:00.000Z',
    ...overrides,
  };
}

type Fn<K extends keyof NotionClient> = NotionClient[K];

/** A NotionClient whose methods are vi.fn()s; `log` records call order by method name. */
export function fakeClient(schema?: DataSourceSchema) {
  const log: string[] = [];
  function track<K extends keyof NotionClient>(name: K, impl: Fn<K>) {
    return vi.fn<Fn<K>>(((...args: Parameters<Fn<K>>) => {
      log.push(name);
      return (impl as (...a: Parameters<Fn<K>>) => ReturnType<Fn<K>>)(...args);
    }) as Fn<K>);
  }
  const client = {
    getMe: track('getMe', () => Promise.resolve(ok({ botName: 'Sitecatch', workspaceName: 'WS' }))),
    searchDataSources: track('searchDataSources', () => Promise.resolve(ok([]))),
    getDataSource: track('getDataSource', (id) =>
      Promise.resolve(ok(schema ?? { id, name: 'DS', properties: {}, titlePropertyId: 'title' })),
    ),
    queryByUrl: track('queryByUrl', () => Promise.resolve(ok([]))),
    createPage: track('createPage', () => Promise.resolve(ok({ id: 'page-1', url: 'https://www.notion.so/page1' }))),
    updatePage: track('updatePage', (id) => Promise.resolve(ok({ id, url: `https://www.notion.so/${id}` }))),
    uploadFile: track('uploadFile', () => Promise.resolve(ok('upload-1'))),
  };
  return { client, log };
}

export function fakeBadge() {
  const calls: string[] = [];
  const badge: Badge = {
    clear: vi.fn(() => {
      calls.push('clear');
      return Promise.resolve();
    }),
    success: vi.fn(() => {
      calls.push('success');
      return Promise.resolve();
    }),
    error: vi.fn(() => {
      calls.push('error');
      return Promise.resolve();
    }),
  };
  return { badge, calls };
}

export const NOW = new Date('2026-10-18T12:00:00.000Z');

export function makeDeps(client: NotionClient, overrides: Partial<BackgroundDeps> = {}) {
  const detached: Promise<unknown>[] = [];
  const { badge } = fakeBadge();
  const deps: BackgroundDeps = {
    createClient: vi.fn(() => client),
    hasHostPermission: vi.fn(() => Promise.resolve(true)),
    getTab: vi.fn(() => Promise.resolve(undefined)),
    captureDeps: vi.fn(() => {
      throw new Error('captureDeps not stubbed');
    }),
    compress: vi.fn(() => Promise.reject(new Error('compress not stubbed'))),
    badge,
    now: () => NOW,
    sleep: () => Promise.resolve(),
    runDetached(task) {
      detached.push(task());
    },
    ...overrides,
  };
  return { deps, detached };
}
