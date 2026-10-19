/** `capture/run`: probe + screenshot of a tab (never fails for restricted pages). */
import { captureTab } from '@/lib/capture/capture';
import { err, ok } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { getSettings } from '@/lib/storage/settings';
import type { BackgroundDeps } from '../context';

export function createCaptureHandlers(deps: BackgroundDeps) {
  const run: Handler<'capture/run'> = async (request) => {
    const tab = Number.isInteger(request.tabId) ? await deps.getTab(request.tabId) : undefined;
    if (!tab) {
      return err('not-found', 'That tab is no longer open. Switch to the page you want to save and try again.', {
        action: 'retry',
        detail: `tab ${String(request.tabId)}`,
      });
    }
    const settings = await getSettings();
    return ok(await captureTab(tab, settings, deps.captureDeps()));
  };
  return { 'capture/run': run };
}
