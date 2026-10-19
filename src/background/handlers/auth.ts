/** `auth/validate`, `auth/status`, `auth/clear`. Responses never contain the token. */
import { err, ok } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { authItem, type AuthState } from '@/lib/storage/items';
import { noHostPermissionError, type BackgroundDeps, type ClientProvider } from '../context';
import { clearSchemaCache } from '../schema-cache';

export function createAuthHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const validate: Handler<'auth/validate'> = async (request) => {
    const token = typeof request.token === 'string' ? request.token.trim() : '';
    if (token === '') {
      return err('validation', 'Paste your Notion token first.', { detail: 'empty token' });
    }
    const tokenKind = request.tokenKind === 'connection' ? 'connection' : 'personal';
    // The permission request itself must happen in the UI click handler.
    if (!(await deps.hasHostPermission())) return noHostPermissionError();

    const me = await deps.createClient(token).getMe();
    if (!me.ok) return me;

    const previous = await authItem.getValue();
    const auth: AuthState = {
      token,
      tokenKind,
      botName: me.data.botName,
      workspaceName: me.data.workspaceName,
      validatedAt: deps.now().toISOString(),
      ...(me.data.maxFileUploadBytes !== undefined
        ? { maxFileUploadBytes: me.data.maxFileUploadBytes }
        : {}),
    };
    await authItem.setValue(auth);
    // A different token may see a different workspace: drop cached schemas.
    if (previous?.token !== token) {
      clients.reset();
      await clearSchemaCache();
    }
    return ok({
      botName: auth.botName,
      workspaceName: auth.workspaceName,
      ...(auth.maxFileUploadBytes !== undefined ? { maxFileUploadBytes: auth.maxFileUploadBytes } : {}),
    });
  };

  const status: Handler<'auth/status'> = async () => {
    const auth = await authItem.getValue();
    const hostPermission = await deps.hasHostPermission();
    if (!auth?.token) return ok({ hasToken: false, hostPermission });
    return ok({
      hasToken: true,
      tokenKind: auth.tokenKind,
      hostPermission,
      ...(auth.workspaceName !== null ? { workspaceName: auth.workspaceName } : {}),
      ...(auth.maxFileUploadBytes !== undefined ? { maxFileUploadBytes: auth.maxFileUploadBytes } : {}),
    });
  };

  const clear: Handler<'auth/clear'> = async () => {
    await authItem.setValue(null);
    clients.reset();
    await clearSchemaCache();
    return ok(null);
  };

  return { 'auth/validate': validate, 'auth/status': status, 'auth/clear': clear };
}
