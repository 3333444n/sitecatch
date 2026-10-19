import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBadge, ERROR_COLOR, SUCCESS_BADGE_MS, SUCCESS_COLOR } from './badge';

function manualTimers() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    setTimeout: (fn: () => void, ms: number) => pending.push({ fn, ms }),
    flush: () => {
      for (const t of pending.splice(0)) t.fn();
    },
    pending,
  };
}

const text = () => browser.action.getBadgeText({});
const color = () => browser.action.getBadgeBackgroundColor({});

function hexToRgba(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

describe('badge', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('shows a green ✓ and clears it after 4 s', async () => {
    const timers = manualTimers();
    const badge = createBadge({ setTimeout: timers.setTimeout });
    await badge.success();
    expect(await text()).toBe('✓');
    expect(await color()).toEqual(hexToRgba(SUCCESS_COLOR));
    expect(timers.pending[0]?.ms).toBe(SUCCESS_BADGE_MS);
    timers.flush();
    await Promise.resolve();
    expect(await text()).toBe('');
  });

  it('shows a red ! until cleared, and a stale ✓ timer does not wipe it', async () => {
    const timers = manualTimers();
    const badge = createBadge({ setTimeout: timers.setTimeout });
    await badge.success();
    await badge.error();
    timers.flush();
    await Promise.resolve();
    expect(await text()).toBe('!');
    expect(await color()).toEqual(hexToRgba(ERROR_COLOR));
    await badge.clear();
    expect(await text()).toBe('');
  });

  it('swallows badge API failures', async () => {
    const badge = createBadge({
      api: {
        setBadgeText: () => Promise.reject(new Error('nope')),
        setBadgeBackgroundColor: () => Promise.reject(new Error('nope')),
      },
      setTimeout: () => undefined,
    });
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      await expect(badge.error()).resolves.toBeUndefined();
    } finally {
      console.warn = warn;
    }
  });
});
