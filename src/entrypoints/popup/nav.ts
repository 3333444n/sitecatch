/** Navigation helpers for the popup: options routes, new tabs, permission prompts. */
import { browser } from 'wxt/browser';

/** Hash routes of the options page. */
export const OPTIONS_ROUTES = {
  setup: '#/setup',
  presets: '#/presets',
  preset: (id: string) => `#/presets/${encodeURIComponent(id)}`,
  help: '#/help',
} as const;

/** Origins Sitecatch needs to talk to Notion. */
export const NOTION_ORIGINS = ['https://api.notion.com/*'];

export function closePopup(): void {
  window.close();
}

/** Opens the options page at `hash` in a new tab and closes the popup. */
export async function openOptions(hash: string): Promise<void> {
  try {
    await browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}${hash}` });
  } catch {
    // Fallback without the route (e.g. tabs API unavailable).
    await browser.runtime.openOptionsPage();
  }
  closePopup();
}

/**
 * Opens (or focuses an already open) options page on its default route and closes the popup.
 * Falls back to a new options tab if `openOptionsPage` rejects.
 */
export async function openSettings(): Promise<void> {
  try {
    await browser.runtime.openOptionsPage();
  } catch {
    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
    } catch {
      // Nothing else to try; still close the popup.
    }
  }
  closePopup();
}

export async function openInNewTab(url: string): Promise<void> {
  await browser.tabs.create({ url });
}

/**
 * Asks for access to api.notion.com. Must be called synchronously from a click
 * handler (no `await` before it), or browsers reject the request.
 */
export function requestNotionPermission(): Promise<boolean> {
  return browser.permissions.request({ origins: NOTION_ORIGINS });
}
