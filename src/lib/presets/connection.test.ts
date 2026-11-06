import { describe, expect, it } from 'vitest';
import { resolvePresetConnection } from './connection';
import { makePreset } from './testing';

const conn = (id: string, workspaceName: string) => ({ id, workspaceName });

describe('resolvePresetConnection', () => {
  const a = conn('a', 'A');
  const b = conn('b', 'B');

  it('uses the bound connection', () => {
    expect(resolvePresetConnection(makePreset({ connectionId: 'b' }), [a, b])).toEqual({ ok: true, data: b });
  });

  it('resolves an unassigned preset to the only connection', () => {
    expect(resolvePresetConnection(makePreset(), [a])).toEqual({ ok: true, data: a });
  });

  it('asks to pick a workspace when unassigned and several exist', () => {
    const res = resolvePresetConnection(makePreset({ name: 'Reading' }), [a, b]);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'edit-preset' } });
    expect(!res.ok && res.error.message).toContain('“Reading”');
  });

  it('names the missing workspace when it is not connected here', () => {
    const res = resolvePresetConnection(makePreset({ connectionId: 'z', workspaceName: 'Acme' }), [a]);
    expect(res).toMatchObject({ ok: false, error: { code: 'no-token', action: 'edit-preset' } });
    expect(!res.ok && res.error.message).toBe(
      'Connect the “Acme” workspace in Sitecatch settings, or pick a workspace for this preset.',
    );
  });

  it('sends to setup when nothing is connected', () => {
    expect(resolvePresetConnection(makePreset({ connectionId: 'a' }), [])).toMatchObject({
      ok: false,
      error: { code: 'no-token', action: 'open-setup' },
    });
  });
});

