/** `conn/add`, `conn/list`, `conn/remove`. Responses never contain a token. */
import { err, ok } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { authItem, connectionsItem, type Connection } from '@/lib/storage/items';
import { findLegacyMatch, loadConnections, toSummary, upsertConnection } from '../connections';
import { noHostPermissionError, type BackgroundDeps, type ClientProvider } from '../context';
import { clearSchemaCache } from '../schema-cache';

/**
 * Before a second workspace is added, presets without a workspace are pinned
 * to the one that was connected, so they keep resolving to it.
 */
async function bindUnassignedPresets(only: Connection, now: Date): Promise<void> {
  for (const preset of await listPresets()) {
    if (preset.connectionId !== null) continue;
    await savePreset({ ...preset, connectionId: only.id, workspaceName: only.workspaceName }, now);
  }
}

export function createConnectionHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const add: Handler<'conn/add'> = async (request) => {
    const token = typeof request.token === 'string' ? request.token.trim() : '';
    if (token === '') {
      return err('validation', 'Paste your Notion token first.', { detail: 'empty token' });
    }
    const tokenKind = request.tokenKind === 'connection' ? 'connection' : 'personal';
    // The permission request itself must happen in the UI click handler.
    if (!(await deps.hasHostPermission())) return noHostPermissionError();

    const me = await deps.createClient(token).getMe();
    if (!me.ok) return me;

    const now = deps.now();
    const existing = await loadConnections();
    const sameWorkspaceId = existing.some((c) => c.token === token)
      ? undefined
      : await findLegacyMatch(existing, me.data.workspaceId, async (c) => {
          const res = await clients.clientFor(c).getMe();
          return res.ok ? res.data.workspaceId : undefined;
        });
    const { connections, connection, previous } = upsertConnection(
      existing,
      {
        token,
        tokenKind,
        botName: me.data.botName,
        workspaceName: me.data.workspaceName,
        validatedAt: now.toISOString(),
        ...(me.data.maxFileUploadBytes !== undefined
          ? { maxFileUploadBytes: me.data.maxFileUploadBytes }
          : {}),
      },
      me.data.workspaceId,
      sameWorkspaceId,
    );
    if (previous === null && existing.length === 1) {
      await bindUnassignedPresets(existing[0] as Connection, now);
    }
    await connectionsItem.setValue(connections);

    if (previous !== null && previous.token !== token) {
      // Keep the legacy copy in step so removing this connection later clears it.
      const legacy = await authItem.getValue();
      if (legacy?.token === previous.token) await authItem.setValue({ ...legacy, token });
      // A different token may see different data sources: drop cached schemas.
      clients.reset(connection.id);
      await clearSchemaCache();
    }
    return ok(toSummary(connection));
  };

  const list: Handler<'conn/list'> = async () => {
    const connections = await loadConnections();
    const hostPermission = await deps.hasHostPermission();
    return ok({ hostPermission, connections: connections.map(toSummary) });
  };

  const remove: Handler<'conn/remove'> = async (request) => {
    if (typeof request.connectionId !== 'string' || request.connectionId === '') {
      return err('validation', 'No workspace was selected.', { detail: 'missing connectionId' });
    }
    const connections = await loadConnections();
    const removed = connections.find((c) => c.id === request.connectionId);
    const remaining = connections.filter((c) => c.id !== request.connectionId);
    await connectionsItem.setValue(remaining);
    // Forget the v0.1 copy too, so "remove" really forgets the token (and the
    // migration can't bring it back once no connections remain).
    const legacy = await authItem.getValue();
    if (legacy && (legacy.token === removed?.token || remaining.length === 0)) {
      await authItem.setValue(null);
    }
    clients.reset(request.connectionId);
    await clearSchemaCache();
    return ok(null);
  };

  return { 'conn/add': add, 'conn/list': list, 'conn/remove': remove };
}
