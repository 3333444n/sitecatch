/**
 * Test-only: typed fake for `sendRequest`. Use together with
 *   vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));
 */
import { vi, type MockInstance } from 'vitest';
import { browser } from 'wxt/browser';
import { err, ok, type AppError, type Result } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { Request, RequestType, Response } from '@/lib/messaging/protocol';
import type { DataSourceSchema, DataSourceSummary } from '@/lib/notion/types';

export type FakeHandlers = {
  [K in RequestType]?: (req: Request<K>) => Result<Response<K>> | Promise<Result<Response<K>>>;
};

const DEFAULTS: FakeHandlers = {
  'auth/status': () => ok({ hasToken: true, tokenKind: 'personal', hostPermission: true, workspaceName: 'Acme' }),
  'auth/clear': () => ok(null),
  'ds/list': () => ok([]),
};

/** Installs handlers (merged over defaults) and returns the mock for assertions. */
export function mockBackend(handlers: FakeHandlers = {}) {
  const all: FakeHandlers = { ...DEFAULTS, ...handlers };
  const mock = vi.mocked(sendRequest);
  mock.mockImplementation((async (req: Request) => {
    const handler = all[req.type] as ((r: Request) => Result<unknown> | Promise<Result<unknown>>) | undefined;
    if (!handler) return err('unknown', `No fake handler for ${req.type}`);
    return handler(req);
  }) as typeof sendRequest);
  return mock;
}

export function fail(error: AppError) {
  return err(error);
}

export const DS_RESOURCES: DataSourceSummary = { id: 'ds-resources', name: 'Resources', icon: { kind: 'emoji', emoji: '📚' } };
export const DS_FAV: DataSourceSummary = { id: 'ds-fav', name: 'Fav websites' };

export function schemaHandler(schemas: DataSourceSchema[]): FakeHandlers['ds/schema'] {
  return (req) => {
    const s = schemas.find((x) => x.id === req.dataSourceId);
    return s ? ok(s) : err('db-not-shared', 'This database isn’t shared with Sitecatch.', { action: 'reshare-db' });
  };
}

type PermissionFn = (perms: { origins?: string[] }) => Promise<boolean>;

/** Spies on `browser.permissions.contains` (its WXT type is callback-overloaded, hence the cast). */
export function mockPermissionContains(impl: PermissionFn): MockInstance<PermissionFn> {
  const spy = vi.spyOn(browser.permissions, 'contains') as unknown as MockInstance<PermissionFn>;
  return spy.mockImplementation(impl);
}

/** Spies on `browser.permissions.request`. */
export function mockPermissionRequest(impl: PermissionFn): MockInstance<PermissionFn> {
  const spy = vi.spyOn(browser.permissions, 'request') as unknown as MockInstance<PermissionFn>;
  return spy.mockImplementation(impl);
}
