import { firstMeta, toHttpUrl } from '../util';
import { defineExtractor } from './define';

export const canonicalUrl = defineExtractor({
  id: 'canonicalUrl',
  label: 'Canonical URL',
  description: 'The "official" address the site declares for this page (link rel=canonical, then og:url).',
  output: 'url',
  extract: (raw) => {
    const link = raw.links.find((l) => l.rel === 'canonical');
    const value = toHttpUrl(link?.href, raw.url) ?? toHttpUrl(firstMeta(raw, ['og:url']), raw.url);
    return value === null ? null : { kind: 'url', value };
  },
});
