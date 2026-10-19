import { describe, expect, it } from 'vitest';
import dataSourceFixture from '@@/test/fixtures/notion/data-source.json';
import errorFixtures from '@@/test/fixtures/notion/errors.json';
import uploadCreated from '@@/test/fixtures/notion/file-upload-created.json';
import uploadUploaded from '@@/test/fixtures/notion/file-upload-uploaded.json';
import pageFixture from '@@/test/fixtures/notion/page.json';
import queryFixture from '@@/test/fixtures/notion/query-by-url.json';
import searchPage1 from '@@/test/fixtures/notion/search-data-sources-page1.json';
import searchPage2 from '@@/test/fixtures/notion/search-data-sources-page2.json';
import usersMe from '@@/test/fixtures/notion/users-me.json';
import { createNotionClient, type NotionClientOptions } from './client';
import { NOTION_VERSION, SINGLE_PART_UPLOAD_MAX_BYTES } from './endpoints';
import { fakeSleep, jsonBody, jsonResponse, mockFetch, type MockReply } from './test-helpers';

const TOKEN = 'ntn_abcdefghijklmnopqrstuvwxyz0123456789';
const DS_ID = '248104cd-477e-80af-bc30-000bd28de8f9';

function setup(replies: MockReply[], extra: Partial<NotionClientOptions> = {}) {
  const mock = mockFetch(replies);
  const { sleep, delays } = fakeSleep();
  const client = createNotionClient({
    token: TOKEN,
    fetch: mock.fetch,
    sleep,
    minIntervalMs: 0,
    ...extra,
  });
  return { client, ...mock, delays };
}

function networkError() {
  return new TypeError('NetworkError when attempting to fetch resource.');
}

describe('request headers', () => {
  it('sends Bearer auth and Notion-Version on GET without a JSON content type', async () => {
    const { client, calls } = setup([jsonResponse(usersMe)]);
    await client.getMe();
    const call = calls[0];
    expect(call?.url).toBe('https://api.notion.com/v1/users/me');
    expect(call?.method).toBe('GET');
    expect(call?.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers.get('Notion-Version')).toBe(NOTION_VERSION);
    expect(NOTION_VERSION).toBe('2026-03-11');
    expect(call?.headers.get('Content-Type')).toBeNull();
    expect(call?.body).toBeUndefined();
  });

  it('sends application/json on JSON bodies', async () => {
    const { client, calls } = setup([jsonResponse(searchPage2)]);
    await client.searchDataSources();
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(calls[0]?.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers.get('Notion-Version')).toBe(NOTION_VERSION);
  });

  it('attaches a timeout AbortSignal to every request', async () => {
    const { client, calls } = setup([jsonResponse(usersMe)]);
    await client.getMe();
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('getMe', () => {
  it('maps bot name, workspace name and upload limit', async () => {
    const { client } = setup([jsonResponse(usersMe)]);
    expect(await client.getMe()).toEqual({
      ok: true,
      data: { botName: 'Sitecatch', workspaceName: "Kicke's Workspace", maxFileUploadBytes: 5242880 },
    });
  });

  it('maps 401 to invalid-token with open-setup and never leaks the token', async () => {
    const { client } = setup([jsonResponse(errorFixtures.unauthorized, 401)]);
    const res = await client.getMe();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('invalid-token');
    expect(res.error.action).toBe('open-setup');
    expect(JSON.stringify(res.error)).not.toContain(TOKEN);
  });
});

describe('searchDataSources', () => {
  it('paginates through all results and maps summaries (skipping trashed)', async () => {
    const { client, calls } = setup([jsonResponse(searchPage1), jsonResponse(searchPage2)]);
    const res = await client.searchDataSources('res');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://api.notion.com/v1/search');
    expect(calls[0]?.method).toBe('POST');
    expect(jsonBody(calls[0])).toEqual({
      query: 'res',
      filter: { property: 'object', value: 'data_source' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 100,
    });
    expect(jsonBody(calls[1])).toMatchObject({ start_cursor: searchPage1.next_cursor });
    expect(res).toEqual({
      ok: true,
      data: [
        {
          id: DS_ID,
          name: 'Resources',
          databaseId: '248104cd-477e-80fd-b757-e945d38000bd',
          icon: { kind: 'emoji', emoji: '📚' },
          url: 'https://www.notion.so/248104cd477e80fdb757e945d38000bd',
        },
        {
          id: '9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
          name: 'Untitled',
          databaseId: '9f1e2d3c-4b5a-4c6d-8e7f-0000000000db',
          icon: { kind: 'url', url: 'https://example.com/star.png' },
          url: 'https://www.notion.so/9f1e2d3c4b5a4c6d8e7f0000000000db',
        },
        {
          id: 'c0ffee00-1234-4abc-9def-001122334455',
          name: 'Fav websites',
          databaseId: 'c0ffee00-1234-4abc-9def-0000000000db',
          icon: { kind: 'url', url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/icon.png' },
          url: 'https://www.notion.so/c0ffee0012344abc9def0000000000db',
        },
      ],
    });
  });

  it('omits query when not given', async () => {
    const { client, calls } = setup([jsonResponse(searchPage2)]);
    await client.searchDataSources();
    expect(jsonBody(calls[0])).not.toHaveProperty('query');
    expect(jsonBody(calls[0])).not.toHaveProperty('start_cursor');
  });

  it('propagates errors from a later page', async () => {
    const { client } = setup([
      jsonResponse(searchPage1),
      jsonResponse(errorFixtures.unauthorized, 401),
    ]);
    const res = await client.searchDataSources();
    expect(res.ok).toBe(false);
  });

  it('returns an empty list when nothing is shared', async () => {
    const { client } = setup([
      jsonResponse({ object: 'list', results: [], next_cursor: null, has_more: false }),
    ]);
    expect(await client.searchDataSources()).toEqual({ ok: true, data: [] });
  });
});

describe('getDataSource', () => {
  it('maps the schema keyed by property id with options and titlePropertyId', async () => {
    const { client, calls } = setup([jsonResponse(dataSourceFixture)]);
    const res = await client.getDataSource(DS_ID);
    expect(calls[0]?.url).toBe(`https://api.notion.com/v1/data_sources/${DS_ID}`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const schema = res.data;
    expect(schema.id).toBe(DS_ID);
    expect(schema.name).toBe('Resources');
    expect(schema.titlePropertyId).toBe('title');
    expect(Object.keys(schema.properties)).toHaveLength(13);
    expect(schema.properties.title).toEqual({ id: 'title', name: 'Name', type: 'title' });
    expect(schema.properties['%3DkSb']).toEqual({ id: '%3DkSb', name: 'URL', type: 'url' });
    expect(schema.properties['Xq%3Aw']?.options).toEqual([
      { id: 'e28f74fc-83a7-4469-8435-27eb18f9f9de', name: 'Article', color: 'blue' },
      { id: '6132d771-b283-4cd9-ba44-b1ed30477c7f', name: 'Tool', color: 'green' },
    ]);
    expect(schema.properties.flsb?.type).toBe('multi_select');
    expect(schema.properties.flsb?.options).toHaveLength(2);
    expect(schema.properties['Ys%5Ee']?.type).toBe('status');
    expect(schema.properties['Ys%5Ee']?.options?.map((o) => o.name)).toEqual([
      'Not started',
      'In progress',
      'Done',
    ]);
    expect(schema.properties.fx01?.type).toBe('formula');
    expect(schema.properties.fx01?.options).toBeUndefined();
    expect(schema.properties.plc1?.type).toBe('unsupported');
  });

  it('url-encodes the id in the path', async () => {
    const { client, calls } = setup([jsonResponse(dataSourceFixture)]);
    await client.getDataSource('a/b');
    expect(calls[0]?.url).toBe('https://api.notion.com/v1/data_sources/a%2Fb');
  });

  it('maps 404 to db-not-shared with share instructions', async () => {
    const { client } = setup([jsonResponse(errorFixtures.object_not_found, 404)]);
    const res = await client.getDataSource(DS_ID);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('db-not-shared');
    expect(res.error.action).toBe('reshare-db');
    expect(res.error.message).toMatch(
      /open the database in Notion → ••• → Connections → add your integration/i,
    );
    expect(res.error.detail).toContain('object_not_found');
  });

  it('rejects a schema without a title property', async () => {
    const { client } = setup([
      jsonResponse({ ...dataSourceFixture, properties: { URL: dataSourceFixture.properties.URL } }),
    ]);
    const res = await client.getDataSource(DS_ID);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('unknown');
  });
});

describe('queryByUrl', () => {
  it('builds an OR filter of url equals on the property id', async () => {
    const { client, calls } = setup([jsonResponse(queryFixture)]);
    const res = await client.queryByUrl(DS_ID, '%3DkSb', [
      'https://example.com/',
      'https://example.com',
      'https://example.com/',
    ]);
    expect(calls[0]?.url).toBe(`https://api.notion.com/v1/data_sources/${DS_ID}/query`);
    expect(calls[0]?.method).toBe('POST');
    expect(jsonBody(calls[0])).toEqual({
      filter: {
        or: [
          { property: '%3DkSb', url: { equals: 'https://example.com/' } },
          { property: '%3DkSb', url: { equals: 'https://example.com' } },
        ],
      },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 100,
      result_type: 'page',
    });
    expect(res).toEqual({
      ok: true,
      data: [
        {
          pageId: '59833787-2cf9-4fdf-8782-e53db20768a5',
          url: 'https://www.notion.so/Example-Domain-598337872cf94fdf8782e53db20768a5',
          title: 'Example Domain',
          lastEditedTime: '2026-10-12T08:15:00.000Z',
        },
        {
          pageId: '0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f',
          url: 'https://www.notion.so/0f9e8d7c6b5a4c3d8e2f1a0b9c8d7e6f',
          title: 'Untitled',
          lastEditedTime: '2026-09-01T12:00:00.000Z',
        },
      ],
    });
  });

  it('uses a single condition for one url and supports rich_text properties', async () => {
    const { client, calls } = setup([jsonResponse({ ...queryFixture, results: [] })]);
    const res = await client.queryByUrl(DS_ID, 'bLc%7B', ['https://a.test/'], 'rich_text');
    expect(jsonBody(calls[0])).toMatchObject({
      filter: { property: 'bLc%7B', rich_text: { equals: 'https://a.test/' } },
    });
    expect(res).toEqual({ ok: true, data: [] });
  });

  it('makes no request for an empty url list', async () => {
    const { client, calls } = setup([]);
    expect(await client.queryByUrl(DS_ID, 'x', ['', ''])).toEqual({ ok: true, data: [] });
    expect(calls).toHaveLength(0);
  });
});

describe('createPage / updatePage', () => {
  const body = {
    parent: { type: 'data_source_id' as const, data_source_id: DS_ID },
    properties: { title: { title: [{ type: 'text' as const, text: { content: 'Example Domain' } }] } },
    cover: { type: 'file_upload' as const, file_upload: { id: uploadCreated.id } },
    icon: { type: 'external' as const, external: { url: 'https://example.com/favicon.ico' } },
    children: [
      {
        object: 'block' as const,
        type: 'image' as const,
        image: { type: 'file_upload' as const, file_upload: { id: uploadCreated.id } },
      },
    ],
  };

  it('POSTs the body to /v1/pages and returns id + url', async () => {
    const { client, calls } = setup([jsonResponse(pageFixture)]);
    const res = await client.createPage(body);
    expect(calls[0]?.url).toBe('https://api.notion.com/v1/pages');
    expect(calls[0]?.method).toBe('POST');
    expect(jsonBody(calls[0])).toEqual(body);
    expect(res).toEqual({
      ok: true,
      data: { id: pageFixture.id, url: pageFixture.url },
    });
  });

  it('does NOT retry createPage on a network error', async () => {
    const { client, calls } = setup([networkError(), jsonResponse(pageFixture)]);
    const res = await client.createPage(body);
    expect(calls).toHaveLength(1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.action).toBe('retry');
    expect(res.error.message).toMatch(/may or may not have been created/);
  });

  it('does NOT retry createPage on 504', async () => {
    const { client, calls } = setup([
      jsonResponse({ object: 'error', status: 504, code: 'gateway_timeout', message: 'x' }, 504),
      jsonResponse(pageFixture),
    ]);
    const res = await client.createPage(body);
    expect(calls).toHaveLength(1);
    expect(res.ok).toBe(false);
  });

  it('does NOT retry createPage on timeout', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const { client, calls } = setup([timeout, jsonResponse(pageFixture)]);
    const res = await client.createPage(body);
    expect(calls).toHaveLength(1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.message).toMatch(/took too long/);
  });

  it('does retry createPage on 429 (request was rejected, not processed)', async () => {
    const { client, calls, delays } = setup([
      jsonResponse(errorFixtures.rate_limited, 429, { 'Retry-After': '2' }),
      jsonResponse(pageFixture),
    ]);
    const res = await client.createPage(body);
    expect(calls).toHaveLength(2);
    expect(delays).toContain(2000);
    expect(res.ok).toBe(true);
  });

  it('maps a 400 validation_error including Notion’s message', async () => {
    const { client } = setup([jsonResponse(errorFixtures.validation_error, 400)]);
    const res = await client.createPage(body);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('validation');
    expect(res.error.action).toBe('edit-preset');
    expect(res.error.message).toContain('body.properties.Type.select.name should be a string');
  });

  it('PATCHes /v1/pages/{id} for updates, retrying transient failures', async () => {
    const { client, calls, delays } = setup([networkError(), jsonResponse(pageFixture)]);
    const res = await client.updatePage(pageFixture.id, { properties: {}, cover: null });
    expect(calls).toHaveLength(2);
    expect(delays).toContain(500);
    expect(calls[1]?.url).toBe(`https://api.notion.com/v1/pages/${pageFixture.id}`);
    expect(calls[1]?.method).toBe('PATCH');
    expect(jsonBody(calls[1])).toEqual({ properties: {}, cover: null });
    expect(res).toEqual({ ok: true, data: { id: pageFixture.id, url: pageFixture.url } });
  });

  it('maps a 404 on update to db-not-shared mentioning the page', async () => {
    const { client } = setup([jsonResponse(errorFixtures.object_not_found, 404)]);
    const res = await client.updatePage('p1', { properties: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('db-not-shared');
    expect(res.error.message).toMatch(/existing Notion page/);
  });
});

describe('uploadFile', () => {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });

  it('creates a single_part upload, sends multipart without manual content type, returns id', async () => {
    const { client, calls } = setup([jsonResponse(uploadCreated), jsonResponse(uploadUploaded)]);
    const res = await client.uploadFile(blob, 'screenshot.jpg', 'image/jpeg');
    expect(res).toEqual({ ok: true, data: uploadCreated.id });

    expect(calls[0]?.url).toBe('https://api.notion.com/v1/file_uploads');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(jsonBody(calls[0])).toEqual({
      mode: 'single_part',
      filename: 'screenshot.jpg',
      content_type: 'image/jpeg',
    });

    const send = calls[1];
    expect(send?.url).toBe(`https://api.notion.com/v1/file_uploads/${uploadCreated.id}/send`);
    expect(send?.method).toBe('POST');
    expect(send?.headers.get('Content-Type')).toBeNull();
    expect(send?.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(send?.headers.get('Notion-Version')).toBe(NOTION_VERSION);
    expect(send?.body).toBeInstanceOf(FormData);
    const file = (send?.body as FormData).get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('screenshot.jpg');
    expect((file as Blob).type).toBe('image/jpeg');
    expect((file as Blob).size).toBe(4);
  });

  it('fails when the send response status is not "uploaded"', async () => {
    const { client } = setup([
      jsonResponse(uploadCreated),
      jsonResponse({ ...uploadUploaded, status: 'failed' }),
    ]);
    const res = await client.uploadFile(blob, 'screenshot.jpg', 'image/jpeg');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.detail).toContain('failed');
  });

  it('rejects files above the single-part / workspace limit without calling Notion', async () => {
    const { client, calls } = setup([]);
    const big = { size: SINGLE_PART_UPLOAD_MAX_BYTES + 1, type: 'image/jpeg' } as Blob;
    const res = await client.uploadFile(big, 'x.jpg', 'image/jpeg');
    expect(calls).toHaveLength(0);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('upload-too-large');

    const res2 = await client.uploadFile(blob, 'x.jpg', 'image/jpeg', { maxBytes: 2 });
    expect(res2.ok).toBe(false);
    if (res2.ok) return;
    expect(res2.error.code).toBe('upload-too-large');
  });

  it('maps a 400 size validation error on send to upload-too-large', async () => {
    const { client } = setup([
      jsonResponse(uploadCreated),
      jsonResponse(errorFixtures.upload_too_large, 400),
    ]);
    const res = await client.uploadFile(blob, 'screenshot.jpg', 'image/jpeg');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('upload-too-large');
  });

  it('maps 413 to upload-too-large', async () => {
    const { client } = setup([
      jsonResponse(uploadCreated),
      new Response('Request Entity Too Large', { status: 413 }),
    ]);
    const res = await client.uploadFile(blob, 'screenshot.jpg', 'image/jpeg');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('upload-too-large');
  });
});

describe('retries and rate limiting (through the client)', () => {
  it('honors Retry-After on 429 and succeeds', async () => {
    const { client, calls, delays } = setup([
      jsonResponse(errorFixtures.rate_limited, 429, { 'Retry-After': '3' }),
      jsonResponse(usersMe),
    ]);
    const res = await client.getMe();
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(delays).toEqual([3000]);
  });

  it('defaults Retry-After to 1s', async () => {
    const { client, delays } = setup([
      jsonResponse(errorFixtures.rate_limited, 429),
      jsonResponse(usersMe),
    ]);
    await client.getMe();
    expect(delays).toEqual([1000]);
  });

  it('gives up after 5 rate-limit retries with rate-limited', async () => {
    const replies = Array.from({ length: 6 }, () =>
      jsonResponse(errorFixtures.rate_limited, 429, { 'Retry-After': '1' }),
    );
    const { client, calls } = setup(replies);
    const res = await client.getMe();
    expect(calls).toHaveLength(6);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('rate-limited');
    expect(res.error.action).toBe('retry');
  });

  it('backs off 0.5/1/2s on 503 then maps to network', async () => {
    const replies = Array.from({ length: 4 }, () =>
      jsonResponse(errorFixtures.service_unavailable, 503),
    );
    const { client, calls, delays } = setup(replies);
    const res = await client.getDataSource(DS_ID);
    expect(calls).toHaveLength(4);
    expect(delays).toEqual([500, 1000, 2000]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.action).toBe('retry');
  });

  it('retries network errors for reads and maps the final failure to network/retry', async () => {
    const { client, calls } = setup([networkError(), networkError(), networkError(), networkError()]);
    const res = await client.getMe();
    expect(calls).toHaveLength(4);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.action).toBe('retry');
  });

  it('times out a hanging request via AbortSignal', async () => {
    const hang = (call: { signal: AbortSignal | null | undefined }) =>
      new Promise<Response>((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => {
          reject(call.signal?.reason instanceof Error ? call.signal.reason : new DOMException('timeout', 'TimeoutError'));
        });
      });
    const { client, calls } = setup([hang], { timeoutMs: 20 });
    const res = await client.createPage({
      parent: { type: 'data_source_id', data_source_id: DS_ID },
      properties: {},
    });
    expect(calls).toHaveLength(1);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.message).toMatch(/took too long/);
  });

  it('serializes concurrent requests', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return jsonResponse(usersMe);
    };
    const { client } = setup([slow, slow, slow]);
    await Promise.all([client.getMe(), client.getMe(), client.getMe()]);
    expect(maxInFlight).toBe(1);
  });

  it('handles non-JSON error bodies by status', async () => {
    const { client } = setup([new Response('<html>Bad Gateway</html>', { status: 502 })], {});
    const res = await client.createPage({
      parent: { type: 'data_source_id', data_source_id: DS_ID },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('network');
    expect(res.error.detail).toBe('HTTP 502');
  });
});

describe('token safety', () => {
  it('redacts the token if it ever appears in an error message from Notion', async () => {
    const { client } = setup([
      jsonResponse(
        { object: 'error', status: 400, code: 'validation_error', message: `bad token ${TOKEN}` },
        400,
      ),
    ]);
    const res = await client.createPage({
      parent: { type: 'data_source_id', data_source_id: DS_ID },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(JSON.stringify(res.error)).not.toContain(TOKEN);
    expect(res.error.message).toContain('[redacted]');
  });

  it('never puts the token in network error details', async () => {
    const { client } = setup(
      [new TypeError(`fetch failed for Bearer ${TOKEN}`)],
      {},
    );
    const res = await client.createPage({ parent: { type: 'data_source_id', data_source_id: DS_ID } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(JSON.stringify(res.error)).not.toContain(TOKEN);
  });
});
