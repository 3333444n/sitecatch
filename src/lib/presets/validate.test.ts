import { describe, expect, it } from 'vitest';
import { allResourcesMappings, makePreset, resourcesChangedSchema, resourcesSchema } from './testing';
import type { PresetIssue } from './types';
import { isBlocking, refreshPropertyNames, validatePreset } from './validate';

const preset = makePreset({
  mappings: allResourcesMappings(),
  screenshot: { filesPropertyId: 'shots', bodyImage: true },
  dedupe: { propertyId: 'p%3Aurl' },
});

describe('validatePreset', () => {
  it('finds no issues against the matching schema', () => {
    expect(validatePreset(preset, resourcesSchema)).toEqual([]);
  });

  it('flags renamed, missing, type-changed and option-missing properties', () => {
    const issues = validatePreset(preset, resourcesChangedSchema);
    const byKey = issues.map((i) => `${i.propertyId}:${i.kind}:${String(i.blocking)}`);
    expect(byKey).toEqual(
      expect.arrayContaining([
        'title:renamed:false',
        'p%3Aurl:missing:true',
        'rating:type-changed:true',
        'kind:option-missing:false',
        'tags:option-missing:false',
        'status:option-missing:true',
        'shots:type-changed:true',
        'fav:type-changed:true',
        'email:missing:true',
        'phone:missing:true',
      ]),
    );
    // dedupe + mapping for p%3Aurl both reported as missing
    expect(issues.filter((i) => i.propertyId === 'p%3Aurl')).toHaveLength(2);
    // the files mapping and the screenshot target both fail
    expect(issues.filter((i) => i.propertyId === 'shots')).toHaveLength(2);
    expect(issues.find((i) => i.propertyId === 'fav')?.detail).toContain("can't write");
  });

  it('flags a dedupe property with an unusable type', () => {
    const issues = validatePreset(makePreset({ dedupe: { propertyId: 'rating' } }), resourcesSchema);
    expect(issues).toEqual([expect.objectContaining({ propertyId: 'rating', kind: 'type-changed', blocking: true })]);
  });

  it('flags a screenshot files property that was deleted', () => {
    const issues = validatePreset(
      makePreset({ screenshot: { filesPropertyId: 'gone', bodyImage: false } }),
      resourcesSchema,
    );
    expect(issues).toEqual([expect.objectContaining({ propertyId: 'gone', kind: 'missing', blocking: true })]);
  });

  it('flags an extractor that is no longer compatible', () => {
    const p = makePreset({
      mappings: [
        { propertyId: 'notes', propertyName: 'Notes', propertyType: 'rich_text', source: { kind: 'extractor', extractor: 'screenshot' }, editableInPopup: false },
      ],
    });
    expect(validatePreset(p, resourcesSchema)[0]?.kind).toBe('type-changed');
  });

  it('isBlocking falls back to the kind for bare issues', () => {
    const bare = (kind: PresetIssue['kind']): PresetIssue => ({ propertyId: 'x', kind, detail: '' });
    expect(isBlocking(bare('missing'))).toBe(true);
    expect(isBlocking(bare('type-changed'))).toBe(true);
    expect(isBlocking(bare('renamed'))).toBe(false);
    expect(isBlocking(bare('option-missing'))).toBe(false);
    const status = validatePreset(preset, resourcesChangedSchema).find((i) => i.propertyId === 'status');
    expect(status && isBlocking(status)).toBe(true);
  });

  it('refreshPropertyNames updates snapshots after a rename', () => {
    const fixed = refreshPropertyNames(preset, resourcesChangedSchema);
    expect(fixed.mappings[0]?.propertyName).toBe('Title');
    expect(validatePreset(fixed, resourcesChangedSchema).some((i) => i.kind === 'renamed')).toBe(false);
  });
});
