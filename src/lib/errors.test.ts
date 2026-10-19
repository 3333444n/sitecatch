import { describe, expect, it } from 'vitest';
import { err, isAppError, ok, toAppError } from './errors';

describe('Result helpers', () => {
  it('ok() wraps data', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it('err() accepts an AppError object', () => {
    const e = { code: 'no-token', message: 'Connect Notion first.', action: 'open-setup' } as const;
    expect(err(e)).toEqual({ ok: false, error: e });
  });

  it('err() accepts code + message + extras', () => {
    expect(err('rate-limited', 'Slow down.', { action: 'retry' })).toEqual({
      ok: false,
      error: { code: 'rate-limited', message: 'Slow down.', action: 'retry' },
    });
  });

  it('toAppError() normalizes thrown values', () => {
    const e = toAppError(new Error('boom'));
    expect(e.code).toBe('unknown');
    expect(e.detail).toBe('boom');
    expect(isAppError(e)).toBe(true);
    expect(isAppError('nope')).toBe(false);
  });
});
