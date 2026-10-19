import { defineExtractor } from './define';

/** CSS generic families and system-font aliases that say nothing about the design. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'apple color emoji',
  'segoe ui emoji',
  'segoe ui symbol',
  'noto color emoji',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

/** Splits a CSS font-family stack into family names (quotes stripped). */
export function splitFontStack(stack: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of stack) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((name) => name.replace(/\s+/g, ' ').trim()).filter((name) => name !== '');
}

/** Distinct, non-generic font families across the given stacks, in order. */
export function fontFamilies(stacks: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const stack of stacks) {
    if (stack === undefined) continue;
    for (const name of splitFontStack(stack)) {
      const key = name.toLowerCase();
      if (GENERIC_FAMILIES.has(key) || key.startsWith('var(') || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

export const fonts = defineExtractor({
  id: 'fonts',
  label: 'Fonts',
  description: 'Font families used for body text and headings (generic fallbacks removed).',
  output: 'list',
  extract: (raw) => {
    const value = fontFamilies([raw.fonts.body, raw.fonts.h1, raw.fonts.h2]);
    return value.length === 0 ? null : { kind: 'list', value };
  },
});
