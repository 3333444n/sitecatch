import { firstMeta } from '../util';
import { defineExtractor } from './define';

export const ogTitle = defineExtractor({
  id: 'ogTitle',
  label: 'Open Graph title',
  description: 'The title the site uses for link previews (og:title, then twitter:title).',
  output: 'text',
  extract: (raw) => {
    const value = firstMeta(raw, ['og:title', 'twitter:title']);
    return value === null ? null : { kind: 'text', value };
  },
});
