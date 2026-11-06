/**
 * Notion workspace connections (`local:connections`): the one-time migration
 * from the v0.1 single token (`local:auth`), pure list updates, and the single
 * rule that decides which connection a preset uses. Background-only: this is
 * the only module besides the handlers that touches tokens.
 */
import { err, ok, type Result } from '@/lib/errors';
import type { ConnectionSummary } from '@/lib/messaging/protocol';
import type { Preset } from '@/lib/presets/types';
import { authItem, connectionsItem, type Connection } from '@/lib/storage/items';

/** Prefix of ids given to connections migrated from v0.1 (whose workspace id wasn't stored). */
export const LEGACY_ID_PREFIX = 'legacy-';

export function isLegacyId(id: string): boolean {
  return id.startsWith(LEGACY_ID_PREFIX);
}

let migrating: Promise<void> | null = null;

/**
 * Copies a v0.1 `local:auth` token into `local:connections` when there are no
 * connections yet. Idempotent and safe to call on every read. `local:auth` is
 * left in place (a downgrade keeps working); `conn/remove` clears it.
 */
export function migrateLegacyAuth(): Promise<void> {
  migrating ??= (async () => {
    const connections = await connectionsItem.getValue();
    if (connections.length > 0) return;
    const auth = await authItem.getValue();
    if (!auth?.token) return;
    const connection: Connection = {
      // The workspace id wasn't stored in v0.1; a random id is stable from here on.
      // `conn/add` can still match it to its workspace (see `findLegacyMatch`).
      id: `${LEGACY_ID_PREFIX}${crypto.randomUUID()}`,
      token: auth.token,
      tokenKind: auth.tokenKind,
      botName: auth.botName,
      workspaceName: auth.workspaceName,
      validatedAt: auth.validatedAt,
      ...(auth.maxFileUploadBytes !== undefined ? { maxFileUploadBytes: auth.maxFileUploadBytes } : {}),
    };
    await connectionsItem.setValue([connection]);
  })().finally(() => {
    migrating = null;
  });
  return migrating;
}

/** All connections, after the legacy migration has run. */
export async function loadConnections(): Promise<Connection[]> {
  await migrateLegacyAuth();
  return connectionsItem.getValue();
}

/** Everything but the token. */
export function toSummary(c: Connection): ConnectionSummary {
  return {
    id: c.id,
    tokenKind: c.tokenKind,
    botName: c.botName,
    workspaceName: c.workspaceName,
    validatedAt: c.validatedAt,
    ...(c.maxFileUploadBytes !== undefined ? { maxFileUploadBytes: c.maxFileUploadBytes } : {}),
  };
}

export interface UpsertResult {
  connections: Connection[];
  connection: Connection;
  /** The connection that was replaced in place, if any. */
  previous: Connection | null;
}

/**
 * Adds a validated connection, or replaces the existing one for the same
 * workspace in place (keeping its id and position). "Same workspace" = the id
 * equals the reported workspace id, the same token is already stored, or
 * `sameWorkspaceId` names it (a v0.1 connection found to be in that workspace).
 */
export function upsertConnection(
  connections: readonly Connection[],
  incoming: Omit<Connection, 'id'>,
  workspaceId: string | undefined,
  sameWorkspaceId?: string,
  newId: () => string = () => crypto.randomUUID(),
): UpsertResult {
  let index = workspaceId !== undefined ? connections.findIndex((c) => c.id === workspaceId) : -1;
  if (index < 0) index = connections.findIndex((c) => c.token === incoming.token);
  if (index < 0 && sameWorkspaceId !== undefined) {
    index = connections.findIndex((c) => c.id === sameWorkspaceId);
  }
  if (index >= 0) {
    const previous = connections[index] as Connection;
    const connection: Connection = { ...incoming, id: previous.id };
    const next = connections.slice();
    next[index] = connection;
    return { connections: next, connection, previous };
  }
  const connection: Connection = { ...incoming, id: workspaceId ?? newId() };
  return { connections: [...connections, connection], connection, previous: null };
}

/**
 * A v0.1-migrated connection in workspace `workspaceId`, found by asking
 * Notion which workspace its token belongs to. Only runs when the new token
 * matched nothing else; a failing (expired) legacy token just doesn't match.
 */
export async function findLegacyMatch(
  connections: readonly Connection[],
  workspaceId: string | undefined,
  workspaceOf: (connection: Connection) => Promise<string | undefined>,
): Promise<string | undefined> {
  if (workspaceId === undefined || connections.some((c) => c.id === workspaceId)) return undefined;
  for (const c of connections) {
    if (!isLegacyId(c.id)) continue;
    if ((await workspaceOf(c)) === workspaceId) return c.id;
  }
  return undefined;
}

function workspaceLabel(name: string | null): string {
  return name ? `“${name}”` : 'this preset’s';
}

/**
 * The connection a preset reads and writes with:
 *   - `connectionId` set and connected here → that connection;
 *   - `connectionId` null and exactly one connection → the only one;
 *   - otherwise unresolved → `no-token` with a message saying what to do.
 */
export function resolvePresetConnection(
  preset: Pick<Preset, 'name' | 'connectionId' | 'workspaceName'>,
  connections: readonly Connection[],
): Result<Connection> {
  if (connections.length === 0) {
    return err('no-token', 'Connect Sitecatch to Notion first: open setup and paste your token.', {
      action: 'open-setup',
    });
  }
  if (preset.connectionId === null) {
    if (connections.length === 1) return ok(connections[0] as Connection);
    return err(
      'no-token',
      `The preset “${preset.name}” isn’t linked to a workspace yet. Open it in Sitecatch settings and pick a workspace.`,
      { action: 'edit-preset', detail: 'preset has no connectionId and several connections exist' },
    );
  }
  const found = connections.find((c) => c.id === preset.connectionId);
  if (found) return ok(found);
  return err(
    'no-token',
    `Connect the ${workspaceLabel(preset.workspaceName)} workspace in Sitecatch settings, or pick a workspace for this preset.`,
    { action: 'edit-preset', detail: 'preset connectionId is not connected on this device' },
  );
}
