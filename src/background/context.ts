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
import { authItem, type AuthState } from '@/lib/storage/items';
import { createBadge, type Badge } from './badge';

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

export interface AuthedClient {
  auth: AuthState;
  client: NotionClient;
}

/** Builds `requireClient`, memoizing one client per token (keeps its rate-limit queue). */
export function createClientProvider(deps: Pick<BackgroundDeps, 'createClient' | 'hasHostPermission'>) {
  let memo: { token: string; client: NotionClient } | null = null;

  function clientFor(token: string): NotionClient {
    if (memo?.token !== token) memo = { token, client: deps.createClient(token) };
    return memo.client;
  }

  /** Stored auth + a client, or `no-token` / `no-host-permission`. */
  async function requireClient(): Promise<Result<AuthedClient>> {
    const auth = await authItem.getValue();
    if (!auth?.token) return noTokenError();
    if (!(await deps.hasHostPermission())) return noHostPermissionError();
    return ok({ auth, client: clientFor(auth.token) });
  }

  return { requireClient, clientFor, reset: () => (memo = null) };
}

export type ClientProvider = ReturnType<typeof createClientProvider>;
