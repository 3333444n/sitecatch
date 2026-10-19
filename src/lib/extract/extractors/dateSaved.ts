import { defineExtractor } from './define';

export const dateSaved = defineExtractor({
  id: 'dateSaved',
  label: 'Date saved',
  description: 'The date and time you saved the page.',
  output: 'date',
  extract: (_raw, ctx) => {
    const time = ctx.now.getTime();
    return Number.isNaN(time) ? null : { kind: 'date', value: ctx.now.toISOString() };
  },
});
