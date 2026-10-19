import { parseUrl } from '../util';
import { defineExtractor } from './define';

/** Hostname without a leading `www.`; '' for non-http(s) URLs. */
export function domainOf(value: string): string {
  const parsed = parseUrl(value);
  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return '';
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
}

export const domain = defineExtractor({
  id: 'domain',
  label: 'Domain',
  description: 'The website\'s domain without "www.", e.g. example.com.',
  output: 'text',
  extract: (raw) => {
    const value = domainOf(raw.url);
    return value === '' ? null : { kind: 'text', value };
  },
});
