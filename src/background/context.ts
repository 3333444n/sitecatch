/**
 * Injectable dependencies for background handlers and the save pipeline, plus
 * the shared "authenticated client" helper. Nothing here relies on state that
 * must survive a background restart: the client memo is a cache that is safe
 * to lose.
 */
import { browser } from 'wxt/browser';
import { createBrowserCaptureDeps, type CaptureDeps, type CaptureTab } from '@/lib/capture/capture';
import { compressScreenshot, type CompressedImage, type CompressOptions } from '@/lib/capture/image';
import { err, ok, type Result } from '@/lib/errors';
import { createNotionClient, type NotionClient } from '@/lib/notion/client';
import type { Preset } from '@/lib/presets/types';
import type { Connection } from '@/lib/storage/items';
import { createBadge, type Badge } from './badge';
import { loadConnections, resolvePresetConnection } from './connections';

export const NOTION_ORIGINS = ['https://api.notion.com/*'];

export interface BackgroundDeps {
  createClient: (token: string) => NotionClient;
  hasHostPermission: () => Promise<boolean>;
  getTab: (tabId: number) => Promise<CaptureTab | undefined>;
  captureDeps: () => CaptureDeps;
  compress: (dataUrl: string, options: CompressOptions) => Promise<Result<CompressedImage>>;
  badge: Badge;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Runs work after the response was sent (save pipeline). Tests capture the promise. */
  runDetached: (task: () => Promise<unknown>) => void;
}

export function createDefaultDeps(): BackgroundDeps {
  return {
    createClient: (token) => createNotionClient({ token }),
    async hasHostPermission() {
      try {
        return await browser.permissions.contains({ origins: NOTION_ORIGINS });
      } catch {
        return false;
      }
    },
    async getTab(tabId) {
      try {
        return await browser.tabs.get(tabId);
      } catch {
        return undefined;
      }
    },
    captureDeps: createBrowserCaptureDeps,
    compress: (dataUrl, options) => compressScreenshot(dataUrl, options),
    badge: createBadge(),
    now: () => new Date(),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    runDetached(task) {
      void task().catch((thrown: unknown) => {
        console.error('[sitecatch] background task failed', thrown);
      });
    },
  };
}

export function noHostPermissionError() {
  return err(
    'no-host-permission',
    'Sitecatch needs permission to reach api.notion.com. Click “Grant access”, then try again.',
    { action: 'grant-permission' },
  );
}

export function noTokenError() {
  return err('no-token', 'Connect Sitecatch to Notion first: open setup and paste your token.', {
    action: 'open-setup',
  });
}

export function connectionGoneError() {
  return err(
    'no-token',
    'That Notion workspace isn’t connected anymore. Add it again in Sitecatch settings → Workspaces.',
    { action: 'open-setup', detail: 'unknown connectionId' },
  );
}

export interface AuthedClient {
  connection: Connection;
  client: NotionClient;
}

/**
 * Builds `requireClient(connectionId)` / `requirePresetClient(preset)`,
 * memoizing one client per connection (and token), so each keeps its own
 * rate-limit queue.
 */
export function createClientProvider(deps: Pick<BackgroundDeps, 'createClient' | 'hasHostPermission'>) {
  const memo = new Map<string, { token: string; client: NotionClient }>();

  function clientFor(connection: Pick<Connection, 'id' | 'token'>): NotionClient {
    const hit = memo.get(connection.id);
    if (hit?.token === connection.token) return hit.client;
    const client = deps.createClient(connection.token);
    memo.set(connection.id, { token: connection.token, client });
    return client;
  }

  async function authed(connection: Connection): Promise<Result<AuthedClient>> {
    if (!(await deps.hasHostPermission())) return noHostPermissionError();
    return ok({ connection, client: clientFor(connection) });
  }

  /** The stored connection + a client, or `no-token` / `no-host-permission`. */
  async function requireClient(connectionId: string): Promise<Result<AuthedClient>> {
    const connections = await loadConnections();
    if (connections.length === 0) return noTokenError();
    const connection = connections.find((c) => c.id === connectionId);
    if (!connection) return connectionGoneError();
    return authed(connection);
  }

  /** The connection a preset resolves to (see `resolvePresetConnection`) + a client. */
  async function requirePresetClient(
    preset: Pick<Preset, 'name' | 'connectionId' | 'workspaceName'>,
  ): Promise<Result<AuthedClient>> {
    const resolved = resolvePresetConnection(preset, await loadConnections());
    if (!resolved.ok) return resolved;
    return authed(resolved.data);
  }

  return {
    requireClient,
    requirePresetClient,
    clientFor,
    /** Forget memoized clients (one connection, or all). */
    reset: (connectionId?: string) => {
      if (connectionId === undefined) memo.clear();
      else memo.delete(connectionId);
    },
  };
}

export type ClientProvider = ReturnType<typeof createClientProvider>;
