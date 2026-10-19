/**
 * Toolbar badge for save results: green ✓ for a few seconds after a success,
 * red ! after a failure until the next save starts. Uses `browser.action`
 * (no permission needed). Badge failures are ignored — they're cosmetic.
 */
import { browser } from 'wxt/browser';

export const SUCCESS_BADGE_MS = 4000;
export const SUCCESS_COLOR = '#2e7d32';
export const ERROR_COLOR = '#c62828';

export interface BadgeApi {
  setBadgeText(details: { text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string }): Promise<void>;
}

export interface Badge {
  /** Clears any previous badge (called when a save starts). */
  clear(): Promise<void>;
  success(): Promise<void>;
  error(): Promise<void>;
}

export interface BadgeOptions {
  api?: BadgeApi;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

export function createBadge(options: BadgeOptions = {}): Badge {
  const api: BadgeApi = options.api ?? {
    setBadgeText: (d) => browser.action.setBadgeText(d),
    setBadgeBackgroundColor: (d) => browser.action.setBadgeBackgroundColor(d),
  };
  const schedule = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  // Bumped on every change so a pending "clear ✓" timer never wipes a newer badge.
  // Losing it on a background restart is harmless.
  let generation = 0;

  async function safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (thrown) {
      console.warn('[sitecatch] badge update failed', thrown);
    }
  }

  async function set(text: string, color?: string): Promise<void> {
    await safe(async () => {
      if (color !== undefined) await api.setBadgeBackgroundColor({ color });
      await api.setBadgeText({ text });
    });
  }

  return {
    async clear() {
      generation++;
      await set('');
    },
    async success() {
      const mine = ++generation;
      await set('✓', SUCCESS_COLOR);
      schedule(() => {
        if (mine === generation) void set('');
      }, SUCCESS_BADGE_MS);
    },
    async error() {
      generation++;
      await set('!', ERROR_COLOR);
    },
  };
}
