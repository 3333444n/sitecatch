import { firstMeta } from '../util';
import { defineExtractor } from './define';

export const metaDescription = defineExtractor({
  id: 'metaDescription',
  label: 'Meta description',
  description: 'The short summary search engines show for the page (meta description).',
  output: 'text',
  extract: (raw) => {
    const value = firstMeta(raw, ['description']);
    return value === null ? null : { kind: 'text', value };
  },
});
