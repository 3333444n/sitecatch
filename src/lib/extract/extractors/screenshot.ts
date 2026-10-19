import { defineExtractor } from './define';

export const screenshot = defineExtractor({
  id: 'screenshot',
  label: 'Screenshot',
  description: 'A JPEG screenshot of the visible part of the page.',
  output: 'image',
  needsPage: false,
  extract: (_raw, ctx) => ctx.screenshot ?? null,
});
