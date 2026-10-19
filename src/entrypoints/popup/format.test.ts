import { describe, expect, it } from 'vitest';
import { hostnameOf, relativeTime, summarizeValue } from './format';

describe('relativeTime', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');
  it.each([
    ['2026-10-18T11:59:50.000Z', 'just now'],
    ['2026-10-18T11:59:00.000Z', '1 minute ago'],
    ['2026-10-18T11:30:00.000Z', '30 minutes ago'],
    ['2026-10-18T09:00:00.000Z', '3 hours ago'],
    ['2026-10-17T10:00:00.000Z', 'yesterday'],
    ['2026-10-10T12:00:00.000Z', '8 days ago'],
    ['nope', 'some time ago'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('falls back to a date for old times', () => {
    expect(relativeTime('2025-01-01T00:00:00.000Z', now)).toMatch(/^on /);
  });
});

describe('summarizeValue', () => {
  it('renders each kind on one line', () => {
    expect(summarizeValue({ kind: 'text', value: ' hi ' })).toBe('hi');
    expect(summarizeValue({ kind: 'number', value: 3 })).toBe('3');
    expect(summarizeValue({ kind: 'number', value: null })).toBe('');
    expect(summarizeValue({ kind: 'checkbox', value: true })).toBe('Yes');
    expect(summarizeValue({ kind: 'select', value: null })).toBe('');
    expect(summarizeValue({ kind: 'multi_select', value: ['a', 'b'] })).toBe('a, b');
    expect(summarizeValue({ kind: 'date', value: { start: '2026-10-18' } })).toBe('2026-10-18');
    expect(summarizeValue({ kind: 'date', value: null })).toBe('');
    expect(
      summarizeValue({ kind: 'files', value: [{ kind: 'screenshot' }, { kind: 'external', url: 'https://x.com/a/og.png' }] }),
    ).toBe('Screenshot, og.png');
  });
});

describe('hostnameOf', () => {
  it('strips www and tolerates bad URLs', () => {
    expect(hostnameOf('https://www.example.com/x')).toBe('example.com');
    expect(hostnameOf('not a url')).toBe('');
  });
});
