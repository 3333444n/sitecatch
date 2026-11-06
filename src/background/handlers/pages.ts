/**
 * `pages/search`: pages of a relation's target data source for the relation
 * picker. The target's title property comes from its (cached) schema.
 */
import { err } from '@/lib/errors';
import { PAGE_OPTIONS_LIMIT, type Handler } from '@/lib/messaging/protocol';
import type { BackgroundDeps, ClientProvider } from '../context';
import { getSchema } from '../schema-cache';

/** Longest query sent to Notion (a title filter longer than this can't match anything useful). */
const MAX_QUERY_LENGTH = 200;

export function createPageHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const search: Handler<'pages/search'> = async (request) => {
    if (typeof request.dataSourceId !== 'string' || request.dataSourceId === '') {
      return err('validation', 'This relation has no linked database to search.', {
        detail: 'missing dataSourceId',
      });
    }
    // Single place where the client is chosen (per-workspace selection is wired in here later).
    const authed = await clients.requireClient();
    if (!authed.ok) return authed;
    const { client } = authed.data;

    const schema = await getSchema(client, request.dataSourceId, { now: deps.now().getTime() });
    if (!schema.ok) return schema;

    const query = typeof request.query === 'string' ? request.query.trim().slice(0, MAX_QUERY_LENGTH) : '';
    return client.searchPages(request.dataSourceId, {
      titlePropertyId: schema.data.titlePropertyId,
      query: query || undefined,
      limit: PAGE_OPTIONS_LIMIT,
    });
  };

  return { 'pages/search': search };
}
