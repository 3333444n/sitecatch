import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/lib/errors';
import type { Handlers, MessageSender } from '@/lib/messaging/protocol';
import { dispatch, isTrustedSender, registerRouter } from './router';

function stubHandlers(overrides: Partial<Handlers> = {}): Handlers {
  const notCalled = vi.fn(() => Promise.reject(new Error('unexpected handler call')));
  return {
    'conn/add': notCalled,
    'conn/list': vi.fn(() => Promise.resolve(ok({ hostPermission: true, connections: [] }))),
    'conn/remove': notCalled,
    'ds/list': notCalled,
    'ds/schema': notCalled,
    'pages/search': notCalled,
    'capture/run': notCalled,
    'dup/check': notCalled,
    'save/start': notCalled,
    'job/get': notCalled,
    ...overrides,
  };
}

/** Enough of a Tab for the router's checks. */
const TAB = { id: 3, index: 0, windowId: 1 } as unknown as NonNullable<MessageSender['tab']>;

function popupSender(): MessageSender {
  return { id: browser.runtime.id, url: browser.runtime.getURL('/popup.html') };
}

/** Triggers onMessage like the browser would and resolves with what the router replied. */
async function send(message: unknown, sender: MessageSender = popupSender()) {
  let reply: unknown = undefined;
  let resolveReply: () => void = () => undefined;
  const replied = new Promise<void>((resolve) => {
    resolveReply = resolve;
  });
  const results = await fakeBrowser.runtime.onMessage.trigger(message, sender, (response: unknown) => {
    reply = response;
    resolveReply();
  });
  const handled = results.some((r: unknown) => r === true);
  if (handled) await replied;
  return { handled, reply };
}

describe('router', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('dispatches a request to its handler and replies with the Result', async () => {
    const handlers = stubHandlers();
    registerRouter(handlers);
    const { handled, reply } = await send({ type: 'conn/list' });
    expect(handled).toBe(true);
    expect(reply).toEqual({ ok: true, data: { hostPermission: true, connections: [] } });
    expect(handlers['conn/list']).toHaveBeenCalledWith({ type: 'conn/list' }, popupSender());
  });

  it('ignores messages that are not requests', async () => {
    const handlers = stubHandlers();
    registerRouter(handlers);
    expect((await send({ type: 'nope' })).handled).toBe(false);
    expect((await send('hello')).handled).toBe(false);
    expect((await send(null)).handled).toBe(false);
    expect(handlers['conn/list']).not.toHaveBeenCalled();
  });

  it('rejects senders from other extensions and content scripts', async () => {
    const handlers = stubHandlers();
    registerRouter(handlers);
    expect((await send({ type: 'conn/list' }, { id: 'someone-else' })).handled).toBe(false);
    const contentScript: MessageSender = {
      id: browser.runtime.id,
      url: 'https://evil.example/page',
      tab: TAB,
    };
    expect((await send({ type: 'conn/list' }, contentScript)).handled).toBe(false);
    expect((await send({ type: 'conn/list' }, { id: browser.runtime.id, tab: contentScript.tab })).handled).toBe(false);
    expect(handlers['conn/list']).not.toHaveBeenCalled();
  });

  it('accepts the options page opened in a tab', () => {
    expect(
      isTrustedSender({
        id: browser.runtime.id,
        url: browser.runtime.getURL('/options.html'),
        tab: TAB,
      }),
    ).toBe(true);
    expect(isTrustedSender({ id: browser.runtime.id })).toBe(true);
  });

  it('turns a throwing handler into an err Result', async () => {
    registerRouter(
      stubHandlers({
        'conn/list': () => Promise.reject(new Error('boom')),
      }),
    );
    const { reply } = await send({ type: 'conn/list' });
    expect(reply).toMatchObject({ ok: false, error: { code: 'unknown', action: 'retry', detail: 'boom' } });
  });

  it('dispatch() also catches synchronous throws', async () => {
    const res = await dispatch(
      stubHandlers({
        'conn/list': () => {
          throw new Error('sync');
        },
      }),
      { type: 'conn/list' },
      popupSender(),
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'unknown', detail: 'sync' } });
  });

  it('unregisters', async () => {
    const off = registerRouter(stubHandlers());
    off();
    expect((await send({ type: 'conn/list' })).handled).toBe(false);
  });
});
