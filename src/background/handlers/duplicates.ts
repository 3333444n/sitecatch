/** `dup/check`: existing pages whose dedupe property matches the (normalized or raw) URL. */
import { ok } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { getPreset } from '@/lib/presets/storage';
import { isDedupeCapable } from '@/lib/presets/validate';
import { urlVariants } from '@/lib/url/normalize';
import type { BackgroundDeps, ClientProvider } from '../context';
import { getSchema } from '../schema-cache';

export function createDuplicateHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const check: Handler<'dup/check'> = async (request) => {
    const presetRes = await getPreset(request.presetId);
    if (!presetRes.ok) return presetRes;
    const preset = presetRes.data;
    const propertyId = preset.dedupe.propertyId;
    const url = typeof request.url === 'string' ? request.url.trim() : '';
    if (propertyId === null || url === '') return ok({ matches: [] });

    const authed = await clients.requireClient();
    if (!authed.ok) return authed;
    const { client } = authed.data;

    // Query by the property's live type (url / rich_text / title); fall back to the mapping snapshot.
    const schema = await getSchema(client, preset.dataSourceId, { now: deps.now().getTime() });
    // A live schema without a usable dedupe property means duplicate check is off.
    if (schema.ok && !isDedupeCapable(schema.data, propertyId)) return ok({ matches: [] });
    const liveType = schema.ok ? schema.data.properties[propertyId]?.type : undefined;
    const mappedType = preset.mappings.find((m) => m.propertyId === propertyId)?.propertyType;
    const type = liveType ?? mappedType ?? 'url';
    if (type !== 'url' && type !== 'rich_text' && type !== 'title') return ok({ matches: [] });

    const res = await client.queryByUrl(preset.dataSourceId, propertyId, urlVariants(url), type);
    if (!res.ok) return res;
    return ok({ matches: res.data });
  };
  return { 'dup/check': check };
}
