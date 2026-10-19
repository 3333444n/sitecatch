import { describe, expect, it } from 'vitest';
import { chunkText, sanitizeOptionName, truncate } from './truncate';

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    expect(chunkText('hello')).toEqual({ chunks: ['hello'], truncated: false });
  });

  it('splits into ≤2000-char chunks', () => {
    const { chunks, truncated } = chunkText('a'.repeat(4500));
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 500]);
    expect(truncated).toBe(false);
  });

  it('caps at 100 chunks and reports truncation', () => {
    const { chunks, truncated } = chunkText('b'.repeat(2000 * 100 + 5));
    expect(chunks).toHaveLength(100);
    expect(truncated).toBe(true);
  });

  it('never splits a surrogate pair', () => {
    const text = 'a'.repeat(1999) + '😀' + 'b';
    const { chunks } = chunkText(text);
    expect(chunks[0]).toBe('a'.repeat(1999));
    expect(chunks[1]).toBe('😀b');
    expect(chunks.join('')).toBe(text);
  });
});

describe('truncate / sanitizeOptionName', () => {
  it('truncates safely', () => {
    expect(truncate('ab😀', 3)).toBe('ab');
    expect(truncate('abc', 5)).toBe('abc');
  });
  it('strips commas, collapses whitespace and caps at 100', () => {
    expect(sanitizeOptionName(' Foo,  bar ,baz ')).toBe('Foo bar baz');
    expect(sanitizeOptionName('x'.repeat(150))).toHaveLength(100);
    expect(sanitizeOptionName(' , ')).toBe('');
  });
});
