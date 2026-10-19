/**
 * Data source schema cache in storage.session (`session:schema:<id>`).
 * Entries older than `SCHEMA_CACHE_TTL_MS` are refetched; `force` always
 * refetches. The save pipeline always forces a fresh schema.
 */
import { browser } from 'wxt/browser';
import { ok, type Result } from '@/lib/errors';
import type { NotionClient } from '@/lib/notion/client';
import type { DataSourceSchema } from '@/lib/notion/types';
import { schemaCacheItem } from '@/lib/storage/items';

export const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

/** Raw `browser.storage.session` key prefix used by `schemaCacheItem`. */
const SCHEMA_KEY_PREFIX = 'schema:';

export interface GetSchemaOptions {
  force?: boolean;
  /** epoch ms; injected for tests. */
  now?: number;
}

export async function getSchema(
  client: Pick<NotionClient, 'getDataSource'>,
  dataSourceId: string,
  options: GetSchemaOptions = {},
): Promise<Result<DataSourceSchema>> {
  const now = options.now ?? Date.now();
  const item = schemaCacheItem(dataSourceId);
  if (!options.force) {
    const cached = await item.getValue();
    if (cached && now - cached.fetchedAt >= 0 && now - cached.fetchedAt < SCHEMA_CACHE_TTL_MS) {
      return ok(cached.schema);
    }
  }
  const res = await client.getDataSource(dataSourceId);
  if (!res.ok) return res;
  await item.setValue({ schema: res.data, fetchedAt: now });
  return res;
}

/** Drops every cached schema (token changed or cleared). */
export async function clearSchemaCache(): Promise<void> {
  const all = await browser.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(SCHEMA_KEY_PREFIX));
  if (keys.length > 0) await browser.storage.session.remove(keys);
}
