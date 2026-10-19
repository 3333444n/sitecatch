import { describe, expect, it } from 'vitest';
import { normalizeUrl, urlVariants } from './normalize';

describe('normalizeUrl', () => {
  it.each([
    ['https://Example.COM/Path', 'https://example.com/Path'],
    ['https://www.example.com/', 'https://www.example.com/'],
    ['https://example.com', 'https://example.com/'],
    ['https://example.com/a/b/', 'https://example.com/a/b'],
    ['https://example.com/a//', 'https://example.com/a'],
    ['https://example.com/a#section', 'https://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['https://example.com/a?utm_source=x&utm_medium=y&UTM_Campaign=z', 'https://example.com/a'],
    ['https://example.com/a?fbclid=1&gclid=2&mc_cid=3&mc_eid=4&ref=5&ref_src=6&igshid=7&si=8', 'https://example.com/a'],
    ['https://example.com/a?b=2&a=1&utm_source=x', 'https://example.com/a?a=1&b=2'],
    ['https://example.com/a?id=1&id=0', 'https://example.com/a?id=1&id=0'],
    ['https://example.com/search?q=hello+world', 'https://example.com/search?q=hello+world'],
    ['  https://example.com/x/  ', 'https://example.com/x'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it('treats tracking variants as the same page', () => {
    expect(normalizeUrl('https://blog.example/post/?utm_source=tw#comments')).toBe(normalizeUrl('https://blog.example/post'));
  });

  it('keeps non-tracking params that merely contain tracking names', () => {
    expect(normalizeUrl('https://example.com/?referrer=a&sid=2')).toBe('https://example.com/?referrer=a&sid=2');
  });

  it('returns unparseable input trimmed', () => {
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });
});

describe('urlVariants', () => {
  it('returns normalized and raw', () => {
    expect(urlVariants('https://example.com/a/?utm_source=x')).toEqual(['https://example.com/a', 'https://example.com/a/?utm_source=x']);
  });

  it('dedupes when already normalized', () => {
    expect(urlVariants('https://example.com/a')).toEqual(['https://example.com/a']);
  });
});
