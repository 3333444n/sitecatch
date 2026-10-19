import { firstMeta } from '../util';
import { defineExtractor } from './define';

export const ogDescription = defineExtractor({
  id: 'ogDescription',
  label: 'Open Graph description',
  description: 'The summary the site uses for link previews (og:description, then twitter:description).',
  output: 'text',
  extract: (raw) => {
    const value = firstMeta(raw, ['og:description', 'twitter:description']);
    return value === null ? null : { kind: 'text', value };
  },
});
