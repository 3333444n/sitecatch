import { describe, expect, it } from 'vitest';
import { createScrubber } from './scrub.mjs';

/** @param {string[]} secrets @param {string[]} chunks */
const run = (secrets, chunks) => {
  const scrubber = createScrubber(secrets);
  return chunks.map((c) => scrubber.push(c)).join('') + scrubber.flush();
};

describe('createScrubber', () => {
  it('redacts every occurrence within a chunk', () => {
    expect(run(['s3cret'], ['a s3cret b s3cret\n'])).toBe('a [redacted] b [redacted]\n');
  });

  it('redacts a secret split across chunks', () => {
    expect(run(['s3cretvalue'], ['token=s3c', 're', 'tvalue ok\n'])).toBe('token=[redacted] ok\n');
  });

  it('redacts a secret at the very end of the stream', () => {
    expect(run(['s3cretvalue'], ['tail s3cret', 'value'])).toBe('tail [redacted]');
  });

  it('handles several secrets and passes other text through unchanged', () => {
    expect(run(['user:1:2', 'abcdef'], ['user:1', ':2 / abc', 'def / plain\n'])).toBe(
      '[redacted] / [redacted] / plain\n',
    );
    expect(run(['abcdef'], ['nothing ', 'to hide\n'])).toBe('nothing to hide\n');
  });

  it('emits complete lines immediately', () => {
    const scrubber = createScrubber(['s3cretvalue']);
    expect(scrubber.push('line one\n')).toBe('line one\n');
  });
});
