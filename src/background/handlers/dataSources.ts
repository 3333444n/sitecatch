/** `ds/list` and `ds/schema` (schema cached in storage.session for 5 minutes). */
import { err } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import type { BackgroundDeps, ClientProvider } from '../context';
import { getSchema } from '../schema-cache';

export function createDataSourceHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const list: Handler<'ds/list'> = async (request) => {
    const authed = await clients.requireClient();
    if (!authed.ok) return authed;
    const query = typeof request.query === 'string' ? request.query.trim() : '';
    return authed.data.client.searchDataSources(query || undefined);
  };

  const schema: Handler<'ds/schema'> = async (request) => {
    if (typeof request.dataSourceId !== 'string' || request.dataSourceId === '') {
      return err('validation', 'No database was selected.', { detail: 'missing dataSourceId' });
    }
    const authed = await clients.requireClient();
    if (!authed.ok) return authed;
    return getSchema(authed.data.client, request.dataSourceId, {
      force: request.force === true,
      now: deps.now().getTime(),
    });
  };

  return { 'ds/list': list, 'ds/schema': schema };
}
