import { parseUrl } from '../util';
import { defineExtractor } from './define';

export const url = defineExtractor({
  id: 'url',
  label: 'URL',
  description: 'The address of the page, exactly as open in the tab.',
  output: 'url',
  extract: (raw) => {
    const parsed = parseUrl(raw.url);
    return parsed === null ? null : { kind: 'url', value: parsed.href };
  },
});
