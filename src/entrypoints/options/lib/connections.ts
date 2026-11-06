/** Shared workspace connections for the options page (from `conn/list`), as a signal. */
import { signal } from '@preact/signals';
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { ConnectionSummary, Response } from '@/lib/messaging/protocol';
import { resolvePresetConnection } from '@/lib/presets/connection';
import type { Preset } from '@/lib/presets/types';
import type { TokenKind } from '@/lib/storage/items';

export type ConnectionsStatus = Response<'conn/list'>;

/** `null` until the first `conn/list` answer arrives. */
export const connectionsStatus = signal<ConnectionsStatus | null>(null);
export const connectionsError = signal<AppError | null>(null);

export async function refreshConnections(): Promise<ConnectionsStatus | null> {
  const res = await sendRequest({ type: 'conn/list' });
  if (res.ok) {
    connectionsStatus.value = res.data;
    connectionsError.value = null;
    return res.data;
  }
  connectionsError.value = res.error;
  // Treat an unreachable background as "not connected" so setup is still usable.
  connectionsStatus.value = { hostPermission: false, connections: [] };
  return null;
}

/** Connected workspaces (empty until loaded). */
export function connections(): ConnectionSummary[] {
  return connectionsStatus.value?.connections ?? [];
}

export function hasConnections(): boolean {
  return connections().length > 0;
}

export async function removeConnection(connectionId: string): Promise<AppError | null> {
  const res = await sendRequest({ type: 'conn/remove', connectionId });
  await refreshConnections();
  return res.ok ? null : res.error;
}

/** The connection a preset uses here, or `null` when it's unresolved. */
export function presetConnection(
  preset: Pick<Preset, 'name' | 'connectionId' | 'workspaceName'>,
  list: readonly ConnectionSummary[] = connections(),
): ConnectionSummary | null {
  const res = resolvePresetConnection(preset, list);
  return res.ok ? res.data : null;
}

export function workspaceName(c: Pick<ConnectionSummary, 'workspaceName'>): string {
  return c.workspaceName ?? 'Unnamed workspace';
}

export const TOKEN_KIND_LABEL: Record<TokenKind, string> = {
  personal: 'Personal access token',
  connection: 'Internal connection',
};
