import { describe, expect, it } from 'vitest';
import { isFormValue, isPreset, isRelationRef } from './guards';
import { makePreset } from './testing';

describe('relation form values', () => {
  it('accepts relation values with id + title refs', () => {
    expect(isFormValue({ kind: 'relation', value: [] })).toBe(true);
    expect(isFormValue({ kind: 'relation', value: [{ id: 'p-1', title: 'Kineo Website' }] })).toBe(true);
    expect(isRelationRef({ id: 'p-1', title: '' })).toBe(true);
  });

  it('rejects malformed relation values', () => {
    expect(isFormValue({ kind: 'relation', value: 'p-1' })).toBe(false);
    expect(isFormValue({ kind: 'relation', value: [{ id: 'p-1' }] })).toBe(false);
    expect(isFormValue({ kind: 'relation', value: [{ id: '', title: 'x' }] })).toBe(false);
    expect(isFormValue({ kind: 'relation', value: [{ id: 1, title: 'x' }] })).toBe(false);
  });

  it('accepts presets with static and ask relation mappings', () => {
    const preset = makePreset({
      mappings: [
        {
          propertyId: 'rel',
          propertyName: 'Projects',
          propertyType: 'relation',
          source: { kind: 'static', value: { kind: 'relation', value: [{ id: 'p-1', title: 'Kineo Website' }] } },
          editableInPopup: false,
        },
        {
          propertyId: 'rel2',
          propertyName: 'Clients',
          propertyType: 'relation',
          source: { kind: 'ask', default: { kind: 'relation', value: [] }, required: true },
          editableInPopup: true,
        },
      ],
    });
    expect(isPreset(JSON.parse(JSON.stringify(preset)))).toBe(true);
  });
});
