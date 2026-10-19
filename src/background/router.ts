/**
 * Background message router. One `runtime.onMessage` listener, registered
 * synchronously at the top level of `defineBackground`, so it exists whenever
 * the event page / service worker is woken up for a message.
 *
 * Replies use the `sendResponse` + `return true` style (works in Firefox,
 * Chrome and WXT's fakeBrowser). Every reply is a `Result`; handler throws are
 * converted with `toAppError`.
 */
import { browser } from 'wxt/browser';
import { err, toAppError, type Result } from '@/lib/errors';
import {
  isRequest,
  type AnyRequest,
  type Handlers,
  type MessageSender,
} from '@/lib/messaging/protocol';

type AnyHandler = (request: AnyRequest, sender: MessageSender) => Promise<Result<unknown>>;

/**
 * Only our own extension pages (popup, options) may talk to the background.
 * Content scripts share the extension id but run in a web page: their
 * `sender.url` is the page's URL and `sender.tab` is set. Sitecatch declares
 * no content scripts, so anything like that is rejected.
 */
export function isTrustedSender(sender: MessageSender): boolean {
  if (sender.id !== browser.runtime.id) return false;
  const origin = browser.runtime.getURL('/');
  if (typeof sender.url === 'string') return sender.url.startsWith(origin);
  // No URL to check: accept only non-tab senders (e.g. the popup in some browsers).
  return sender.tab === undefined;
}

/** Runs the handler for `request`, converting throws/rejections into `err(...)`. */
export async function dispatch(
  handlers: Handlers,
  request: AnyRequest,
  sender: MessageSender,
): Promise<Result<unknown>> {
  const handler = handlers[request.type] as AnyHandler | undefined;
  if (!handler) {
    return err('unknown', 'Sitecatch didn’t understand that request. Try reloading the extension.', {
      detail: `No handler for "${request.type}"`,
    });
  }
  try {
    return await handler(request, sender);
  } catch (thrown) {
    return err(toAppError(thrown));
  }
}

/** Registers the router. Returns a function that removes the listener (tests). */
export function registerRouter(handlers: Handlers): () => void {
  const listener = (
    message: unknown,
    sender: MessageSender,
    sendResponse: (response: unknown) => void,
  ): true | undefined => {
    if (!isRequest(message)) return undefined;
    if (!isTrustedSender(sender)) return undefined;
    void dispatch(handlers, message, sender).then(sendResponse, (thrown: unknown) => {
      sendResponse(err(toAppError(thrown)));
    });
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
  };
}
