import { cleanMultiline } from '../util';
import { defineExtractor } from './define';

export const selection = defineExtractor({
  id: 'selection',
  label: 'Selected text',
  description: 'Whatever text you had highlighted on the page when opening Sitecatch.',
  output: 'text',
  extract: (raw) => {
    const value = cleanMultiline(raw.selection);
    return value === '' ? null : { kind: 'text', value };
  },
});
