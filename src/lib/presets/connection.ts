/**
 * The single rule that decides which workspace connection a preset uses.
 * Generic over the connection shape so the background (full `Connection`, with
 * token) and the UI (`ConnectionSummary`) share it.
 */
import { err, ok, type Result } from '@/lib/errors';
import type { Preset } from './types';

function workspaceLabel(name: string | null): string {
  return name ? `“${name}”` : 'this preset’s';
}

/**
 * The connection a preset reads and writes with:
 *   - `connectionId` set and connected here → that connection;
 *   - `connectionId` null and exactly one connection → the only one;
 *   - otherwise unresolved → `no-token` with a message saying what to do.
 */
export function resolvePresetConnection<C extends { id: string }>(
  preset: Pick<Preset, 'name' | 'connectionId' | 'workspaceName'>,
  connections: readonly C[],
): Result<C> {
  if (connections.length === 0) {
    return err('no-token', 'Connect Sitecatch to Notion first: open setup and paste your token.', {
      action: 'open-setup',
    });
  }
  if (preset.connectionId === null) {
    if (connections.length === 1) return ok(connections[0] as C);
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
