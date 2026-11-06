import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { authItem, connectionsItem } from '@/lib/storage/items';
import {
  findLegacyMatch,
  loadConnections,
  migrateLegacyAuth,
  toSummary,
  upsertConnection,
} from './connections';
import { makeAuth, makeConnection, TOKEN } from './test-helpers';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('migrateLegacyAuth', () => {
  it('copies local:auth into connections once, keeping local:auth', async () => {
    await authItem.setValue(makeAuth({ maxFileUploadBytes: 9 }));
    await migrateLegacyAuth();
    const first = await connectionsItem.getValue();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      token: TOKEN,
      tokenKind: 'connection',
      botName: 'Sitecatch',
      workspaceName: 'My workspace',
      maxFileUploadBytes: 9,
    });
    expect(first[0]?.id).toMatch(/^legacy-/);
    expect(await authItem.getValue()).not.toBeNull();

    // Idempotent: a second run (or a concurrent one) changes nothing.
    await Promise.all([migrateLegacyAuth(), migrateLegacyAuth()]);
    expect(await connectionsItem.getValue()).toEqual(first);
  });

  it('concurrent first reads agree on one connection', async () => {
    await authItem.setValue(makeAuth());
    const [a, b] = await Promise.all([loadConnections(), loadConnections()]);
    expect(a).toEqual(b);
    expect(await connectionsItem.getValue()).toHaveLength(1);
  });

  it('does nothing when connections already exist', async () => {
    await authItem.setValue(makeAuth({ token: 'legacy' }));
    await connectionsItem.setValue([makeConnection()]);
    await migrateLegacyAuth();
    expect(await connectionsItem.getValue()).toEqual([makeConnection()]);
  });

  it('does nothing without a legacy token', async () => {
    await migrateLegacyAuth();
    expect(await connectionsItem.getValue()).toEqual([]);
  });
});

describe('upsertConnection', () => {
  const incoming = { ...makeConnection(), token: 'new' } as const;
  const { id: _id, ...fields } = incoming;

  it('appends with the workspace id', () => {
    const res = upsertConnection([makeConnection({ id: 'a', token: 'ta' })], fields, 'ws-b');
    expect(res.previous).toBeNull();
    expect(res.connections.map((c) => c.id)).toEqual(['a', 'ws-b']);
  });

  it('appends with a random id when no workspace id is reported', () => {
    const res = upsertConnection([], fields, undefined, undefined, () => 'rand');
    expect(res.connection.id).toBe('rand');
  });

  it('replaces in place by workspace id (keeps id and order)', () => {
    const list = [makeConnection({ id: 'a', token: 'ta' }), makeConnection({ id: 'b', token: 'tb' })];
    const res = upsertConnection(list, fields, 'a');
    expect(res.previous?.token).toBe('ta');
    expect(res.connections.map((c) => [c.id, c.token])).toEqual([
      ['a', 'new'],
      ['b', 'tb'],
    ]);
  });

  it('replaces in place by identical token', () => {
    const list = [makeConnection({ id: 'legacy-1', token: 'new', botName: 'Old' })];
    const res = upsertConnection(list, fields, 'ws-x');
    expect(res.connections).toHaveLength(1);
    expect(res.connection.id).toBe('legacy-1');
  });

  it('replaces the named same-workspace connection', () => {
    const list = [makeConnection({ id: 'legacy-1', token: 'old' })];
    const res = upsertConnection(list, fields, 'ws-x', 'legacy-1');
    expect(res.connections.map((c) => [c.id, c.token])).toEqual([['legacy-1', 'new']]);
  });
});

describe('findLegacyMatch', () => {
  const list = [makeConnection({ id: 'ws-a' }), makeConnection({ id: 'legacy-1', token: 'tl' })];

  it('asks Notion only for legacy connections', async () => {
    const asked: string[] = [];
    const id = await findLegacyMatch(list, 'ws-l', (c) => {
      asked.push(c.id);
      return Promise.resolve('ws-l');
    });
    expect(id).toBe('legacy-1');
    expect(asked).toEqual(['legacy-1']);
  });

  it('skips the lookup when the workspace id is already connected or unknown', async () => {
    const never = () => Promise.reject(new Error('not called'));
    expect(await findLegacyMatch(list, 'ws-a', never)).toBeUndefined();
    expect(await findLegacyMatch(list, undefined, never)).toBeUndefined();
  });
});

describe('toSummary', () => {
  it('drops the token', () => {
    const summary = toSummary(makeConnection({ maxFileUploadBytes: 1 }));
    expect('token' in summary).toBe(false);
    expect(JSON.stringify(summary)).not.toContain(TOKEN);
  });
});
