/** Shared auth status for the options page (from `auth/status`), as a signal. */
import { signal } from '@preact/signals';
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { Response } from '@/lib/messaging/protocol';
import type { TokenKind } from '@/lib/storage/items';

export type AuthStatus = Response<'auth/status'>;

/** `null` until the first `auth/status` answer arrives. */
export const authStatus = signal<AuthStatus | null>(null);
export const authError = signal<AppError | null>(null);

export async function refreshAuth(): Promise<AuthStatus | null> {
  const res = await sendRequest({ type: 'auth/status' });
  if (res.ok) {
    authStatus.value = res.data;
    authError.value = null;
    return res.data;
  }
  authError.value = res.error;
  // Treat an unreachable background as "not connected" so setup is still usable.
  authStatus.value = { hasToken: false, hostPermission: false };
  return null;
}

export async function disconnect(): Promise<AppError | null> {
  const res = await sendRequest({ type: 'auth/clear' });
  await refreshAuth();
  return res.ok ? null : res.error;
}

export const TOKEN_KIND_LABEL: Record<TokenKind, string> = {
  personal: 'Personal access token',
  connection: 'Internal connection',
};
