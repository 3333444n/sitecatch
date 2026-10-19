/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * Typed client for UI pages (popup/options) to talk to the background.
 */
import { browser } from 'wxt/browser';
import { err, type Result } from '@/lib/errors';
import type { Request, RequestType, Response } from './protocol';

export type { Handler, Handlers } from './protocol';

function isResult(value: unknown): value is Result<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

/**
 * Send a request to the background and get a typed `Result`. Never throws:
 * transport failures become `AppError`s.
 *
 * @example
 *   const res = await sendRequest({ type: 'ds/schema', dataSourceId });
 *   if (!res.ok) showError(res.error);
 */
export async function sendRequest<T extends RequestType>(request: Request<T>): Promise<Result<Response<T>>> {
  try {
    const response: unknown = await browser.runtime.sendMessage(request);
    if (isResult(response)) return response as Result<Response<T>>;
    return err('unknown', 'Sitecatch’s background process did not respond. Try reopening the popup.', {
      action: 'retry',
      detail: `No valid response for "${request.type}"`,
    });
  } catch (thrown) {
    return err('unknown', 'Couldn’t reach Sitecatch’s background process. Try reopening the popup.', {
      action: 'retry',
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    });
  }
}
