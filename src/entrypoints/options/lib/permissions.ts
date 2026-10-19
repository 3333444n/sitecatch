/**
 * Host permission for api.notion.com. Firefox lets users revoke host
 * permissions even when they're listed in the manifest, so we check and, if
 * needed, request them.
 *
 * `requestNotionAccess` MUST be called synchronously inside a click handler
 * (no `await` before it), or the browser rejects the request as not being a
 * user gesture.
 */
import { browser } from 'wxt/browser';
import { NOTION_API_ORIGIN } from './constants';

const NOTION_PERMISSIONS = { origins: [NOTION_API_ORIGIN] };

export async function hasNotionAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains(NOTION_PERMISSIONS);
  } catch {
    return false;
  }
}

/** Starts the permission prompt immediately. Resolves to whether access was granted. */
export function requestNotionAccess(): Promise<boolean> {
  let pending: Promise<boolean>;
  try {
    pending = browser.permissions.request(NOTION_PERMISSIONS);
  } catch {
    return Promise.resolve(false);
  }
  return pending.catch(() => false);
}
