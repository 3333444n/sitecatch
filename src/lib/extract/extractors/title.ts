import { cleanText } from '../util';
import { defineExtractor } from './define';

export const title = defineExtractor({
  id: 'title',
  label: 'Page title',
  description: "The page's title as shown in the browser tab.",
  output: 'text',
  extract: (raw) => {
    const value = cleanText(raw.title);
    return value === '' ? null : { kind: 'text', value };
  },
});
