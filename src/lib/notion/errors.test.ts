import { describe, expect, it } from 'vitest';
import errorFixtures from '@@/test/fixtures/notion/errors.json';
import type { AppErrorAction, AppErrorCode } from '@/lib/errors';
import {
  mapHttpError,
  mapNetworkError,
  parseErrorBody,
  redactError,
  redactSecrets,
  type NotionOperation,
} from './errors';

describe('parseErrorBody', () => {
  it('reads Notion error bodies', () => {
    expect(parseErrorBody(errorFixtures.object_not_found)).toEqual(errorFixtures.object_not_found);
  });

  it('returns null for non-error shapes', () => {
    expect(parseErrorBody(null)).toBeNull();
    expect(parseErrorBody('oops')).toBeNull();
    expect(parseErrorBody({ foo: 1 })).toBeNull();
  });
});

describe('mapHttpError table', () => {
  const cases: {
    name: string;
    status: number;
    body: keyof typeof errorFixtures | null;
    op: NotionOperation;
    code: AppErrorCode;
    action: AppErrorAction | undefined;
    message: RegExp;
  }[] = [
    { name: '401', status: 401, body: 'unauthorized', op: 'auth', code: 'invalid-token', action: 'open-setup', message: /token/ },
    { name: '403 restricted_resource', status: 403, body: 'restricted_resource', op: 'create-page', code: 'missing-capability', action: 'open-setup', message: /Capabilities/ },
    { name: '404 object_not_found', status: 404, body: 'object_not_found', op: 'data-source', code: 'db-not-shared', action: 'reshare-db', message: /••• → Connections → add your integration/ },
    { name: '400 validation_error', status: 400, body: 'validation_error', op: 'create-page', code: 'validation', action: 'edit-preset', message: /should be a string/ },
    { name: '400 other code', status: 400, body: 'invalid_request_url', op: 'search', code: 'validation', action: undefined, message: /Invalid request URL/ },
    { name: '400 size on upload', status: 400, body: 'upload_too_large', op: 'upload', code: 'upload-too-large', action: undefined, message: /too large/ },
    { name: '400 size elsewhere is validation', status: 400, body: 'upload_too_large', op: 'create-page', code: 'validation', action: 'edit-preset', message: /exceeds/ },
    { name: '413', status: 413, body: null, op: 'upload', code: 'upload-too-large', action: undefined, message: /too large/ },
    { name: '429', status: 429, body: 'rate_limited', op: 'query', code: 'rate-limited', action: 'retry', message: /rate-limiting/ },
    { name: '409', status: 409, body: 'conflict_error', op: 'update-page', code: 'network', action: 'retry', message: /conflict/ },
    { name: '500', status: 500, body: 'internal_server_error', op: 'search', code: 'network', action: 'retry', message: /trouble/ },
    { name: '503', status: 503, body: 'service_unavailable', op: 'search', code: 'network', action: 'retry', message: /trouble/ },
    { name: '418 unknown', status: 418, body: null, op: 'search', code: 'unknown', action: 'retry', message: /unexpected/ },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.code}`, () => {
      const body = c.body ? parseErrorBody(errorFixtures[c.body]) : null;
      const e = mapHttpError(c.status, body, c.op);
      expect(e.code).toBe(c.code);
      expect(e.action).toBe(c.action);
      expect(e.message).toMatch(c.message);
      expect(e.detail).toContain(`HTTP ${c.status}`);
      if (c.body) expect(e.detail).toContain(errorFixtures[c.body].request_id);
    });
  }

  it('truncates very long Notion messages in user copy but keeps them in detail', () => {
    const long = 'x'.repeat(1000);
    const e = mapHttpError(400, { code: 'validation_error', message: long }, 'create-page');
    expect(e.message.length).toBeLessThan(500);
    expect(e.detail).toContain(long);
  });
});

describe('mapNetworkError', () => {
  it('maps fetch TypeError to network/retry', () => {
    const e = mapNetworkError(new TypeError('Failed to fetch'), 'search');
    expect(e).toMatchObject({ code: 'network', action: 'retry' });
    expect(e.message).toMatch(/internet connection/);
    expect(e.detail).toContain('Failed to fetch');
  });

  it('recognizes timeouts', () => {
    const e = mapNetworkError(new DOMException('timed out', 'TimeoutError'), 'query');
    expect(e.message).toMatch(/took too long/);
    expect(e.detail).toMatch(/^timeout/);
  });

  it('warns that page creation outcome is uncertain', () => {
    const e = mapNetworkError(new TypeError('x'), 'create-page');
    expect(e.message).toMatch(/may or may not have been created/);
  });
});

describe('redaction', () => {
  it('removes the exact token and anything token-shaped', () => {
    expect(redactSecrets('a my-weird-token b', 'my-weird-token')).toBe('a [redacted] b');
    expect(redactSecrets('ntn_12345678abcdefgh and secret_ABCDEFGH12345678')).toBe(
      '[redacted] and [redacted]',
    );
  });

  it('redacts message and detail of an AppError', () => {
    const e = redactError(
      { code: 'unknown', message: 'tok ntn_aaaaaaaaaaaa', detail: 'tok ntn_bbbbbbbbbbbb' },
    );
    expect(e.message).toBe('tok [redacted]');
    expect(e.detail).toBe('tok [redacted]');
  });
});
