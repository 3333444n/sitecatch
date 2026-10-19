/**
 * End-to-end test of the background: the real router and real handlers, wired
 * to WXT's fakeBrowser and a real Notion client whose `fetch` is a small
 * in-memory fake of the Notion API. Messages go through `runtime.onMessage`
 * exactly like the popup's would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Result } from '@/lib/errors';
import type { JobState, MessageSender, Request, RequestType, Response as Reply } from '@/lib/messaging/protocol';
import { createNotionClient } from '@/lib/notion/client';
import { jsonResponse } from '@/lib/notion/test-helpers';
import { savePreset } from '@/lib/presets/storage';
import { makeCapture, makePreset } from '@/lib/presets/testing';
import { authItem, historyItem } from '@/lib/storage/items';
import { createHandlers } from './handlers';
import { registerRouter } from './router';
import { fakeClient, makeDeps, TOKEN } from './test-helpers';

const DS_ID = 'ds-resources';

const RAW_DATA_SOURCE = {
  object: 'data_source',
  id: DS_ID,
  title: [{ type: 'text', plain_text: 'Resources', text: { content: 'Resources' } }],
  parent: { type: 'database_id', database_id: 'db-1' },
  url: 'https://www.notion.so/db1',
  properties: {
    Name: { id: 'title', name: 'Name', type: 'title', title: {} },
    URL: { id: 'p%3Aurl', name: 'URL', type: 'url', url: {} },
    Screenshot: { id: 'shots', name: 'Screenshot', type: 'files', files: {} },
  },
};

interface StoredPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
  last_edited_time: string;
}

/** A tiny stateful fake of the Notion endpoints Sitecatch uses. */
function fakeNotion() {
  const pages: StoredPage[] = [];
  const uploads = new Set<string>();
  const calls: string[] = [];
  const auth: string[] = [];

  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const path = url.replace('https://api.notion.com/v1', '');
    calls.push(`${method} ${path}`);
    auth.push(new Headers(init?.headers).get('Authorization') ?? '');
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;

    if (method === 'GET' && path === '/users/me') {
      return Promise.resolve(
        jsonResponse({
          object: 'user',
          id: 'bot-1',
          name: 'Sitecatch',
          type: 'bot',
          bot: { workspace_name: 'My workspace', workspace_limits: { max_file_upload_size_in_bytes: 5242880 } },
        }),
      );
    }
    if (method === 'POST' && path === '/search') {
      return Promise.resolve(jsonResponse({ object: 'list', results: [RAW_DATA_SOURCE], has_more: false, next_cursor: null }));
    }
    if (method === 'GET' && path === `/data_sources/${DS_ID}`) {
      return Promise.resolve(jsonResponse(RAW_DATA_SOURCE));
    }
    if (method === 'POST' && path === `/data_sources/${DS_ID}/query`) {
      const filter = body?.filter as Record<string, unknown>;
      const conditions = (Array.isArray(filter.or) ? filter.or : [filter]) as {
        property: string;
        url?: { equals: string };
      }[];
      const results = pages
        .filter((p) =>
          conditions.some((c) => {
            const prop = p.properties[c.property] as { url?: string } | undefined;
            return c.url !== undefined && prop?.url === c.url.equals;
          }),
        )
        .map((p) => ({
          object: 'page',
          id: p.id,
          url: p.url,
          in_trash: false,
          last_edited_time: p.last_edited_time,
          properties: {
            Name: {
              id: 'title',
              type: 'title',
              title: [{ plain_text: ((p.properties.title as { title: { text: { content: string } }[] }).title[0]?.text.content) ?? '' }],
            },
          },
        }));
      return Promise.resolve(jsonResponse({ object: 'list', results, has_more: false, next_cursor: null }));
    }
    if (method === 'POST' && path === '/file_uploads') {
      const id = `upload-${String(uploads.size + 1)}`;
      uploads.add(id);
      return Promise.resolve(jsonResponse({ object: 'file_upload', id, status: 'pending' }));
    }
    const send = /^\/file_uploads\/([^/]+)\/send$/.exec(path);
    if (method === 'POST' && send) {
      expect(init?.body).toBeInstanceOf(FormData);
      return Promise.resolve(jsonResponse({ object: 'file_upload', id: send[1], status: 'uploaded' }));
    }
    if (method === 'POST' && path === '/pages') {
      const id = `page-${String(pages.length + 1)}`;
      const page: StoredPage = {
        id,
        url: `https://www.notion.so/Example-${id}`,
        properties: (body?.properties ?? {}) as Record<string, unknown>,
        last_edited_time: '2026-10-18T12:00:00.000Z',
      };
      pages.push(page);
      return Promise.resolve(jsonResponse({ object: 'page', id, url: page.url }));
    }
    return Promise.resolve(jsonResponse({ object: 'error', status: 404, code: 'object_not_found', message: `No route ${method} ${path}` }, 404));
  });

  return { fetch: fetchImpl as unknown as typeof fetch, pages, calls, auth };
}

let unregister: () => void = () => undefined;

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  unregister();
});

function popupSender(): MessageSender {
  return { id: browser.runtime.id, url: browser.runtime.getURL('/popup.html') };
}

/** Sends a request through `runtime.onMessage`, like `sendRequest()` from the popup. */
function send<T extends RequestType>(request: Request<T>, sender: MessageSender = popupSender()) {
  return new Promise<Result<Reply<T>>>((resolve) => {
    void fakeBrowser.runtime.onMessage.trigger(request, sender, (response: unknown) => {
      resolve(response as Result<Reply<T>>);
    });
  });
}

function setup() {
  const notion = fakeNotion();
  const { deps, detached } = makeDeps(fakeClient().client, {
    createClient: (token) => createNotionClient({ token, fetch: notion.fetch, minIntervalMs: 0 }),
  });
  unregister = registerRouter(createHandlers(deps));
  return { notion, detached };
}

describe('background integration (router + handlers + Notion client)', () => {
  it('validates, lists, reads the schema, saves with a screenshot and then finds the duplicate', async () => {
    const { notion, detached } = setup();

    // 1. Validate the token.
    const validated = await send({ type: 'auth/validate', token: TOKEN, tokenKind: 'personal' });
    expect(validated).toEqual({
      ok: true,
      data: { botName: 'Sitecatch', workspaceName: 'My workspace', maxFileUploadBytes: 5242880 },
    });
    expect(await authItem.getValue()).toMatchObject({ token: TOKEN, tokenKind: 'personal' });
    expect(JSON.stringify(validated)).not.toContain(TOKEN);

    // 2. List data sources.
    const list = await send({ type: 'ds/list' });
    expect(list).toMatchObject({ ok: true, data: [{ id: DS_ID, name: 'Resources', databaseId: 'db-1' }] });

    // 3. Read the schema.
    const schema = await send({ type: 'ds/schema', dataSourceId: DS_ID });
    expect(schema.ok && Object.keys(schema.data.properties).sort()).toEqual(['p%3Aurl', 'shots', 'title']);

    // 4. Save a preset (create) with the screenshot attached to a files property.
    await savePreset(
      makePreset({
        dataSourceId: DS_ID,
        mappings: [
          { propertyId: 'title', propertyName: 'Name', propertyType: 'title', source: { kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] }, editableInPopup: true },
          { propertyId: 'p%3Aurl', propertyName: 'URL', propertyType: 'url', source: { kind: 'extractor', extractor: 'url' }, editableInPopup: false },
        ],
        screenshot: { filesPropertyId: 'shots', bodyImage: false },
        dedupe: { propertyId: 'p%3Aurl' },
      }),
    );
    const capture = makeCapture();
    const started = await send({
      type: 'save/start',
      presetId: 'preset-1',
      values: {
        title: { kind: 'text', value: 'Example — OG' },
        'p%3Aurl': { kind: 'text', value: 'https://Example.com/article?utm_source=x' },
      },
      capture,
      mode: { kind: 'create' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await Promise.all(detached);

    const job = await send({ type: 'job/get', jobId: started.data.jobId });
    expect(job.ok).toBe(true);
    const state = (job as { ok: true; data: JobState }).data;
    expect(state).toMatchObject({ status: 'done', pageUrl: 'https://www.notion.so/Example-page-1', presetName: 'Resources' });
    expect(state.warnings).toBeUndefined();

    // Upload happened before the page create, and the page references it.
    const order = notion.calls.filter((c) => c.startsWith('POST /file_uploads') || c === 'POST /pages');
    expect(order).toEqual(['POST /file_uploads', 'POST /file_uploads/upload-1/send', 'POST /pages']);
    const page = notion.pages[0];
    expect(page?.properties.shots).toEqual({
      files: [{ type: 'file_upload', file_upload: { id: 'upload-1' }, name: 'screenshot.jpg' }],
    });
    // The dedupe property gets the normalized URL.
    expect(page?.properties['p%3Aurl']).toEqual({ url: 'https://example.com/article' });
    expect(notion.auth.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);

    const history = await historyItem.getValue();
    expect(history[0]).toMatchObject({ pageUrl: 'https://www.notion.so/Example-page-1', sourceUrl: capture.url });

    // 5. The duplicate check now finds the saved page (raw URL in, normalized match).
    const dup = await send({ type: 'dup/check', presetId: 'preset-1', url: 'https://example.com/article/?utm_source=x#top' });
    expect(dup).toMatchObject({
      ok: true,
      data: { matches: [{ pageId: 'page-1', url: 'https://www.notion.so/Example-page-1', title: 'Example — OG' }] },
    });
  });

  it('ignores messages from untrusted senders', async () => {
    setup();
    const listener = vi.fn();
    const result = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'auth/status' },
      { id: browser.runtime.id, url: 'https://evil.example/', tab: { id: 1 } as MessageSender['tab'] },
      listener,
    );
    expect(result).toEqual([undefined]);
    expect(listener).not.toHaveBeenCalled();
  });
});
