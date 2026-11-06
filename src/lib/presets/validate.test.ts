import { describe, expect, it } from 'vitest';
import { allResourcesMappings, makePreset, resourcesChangedSchema, resourcesSchema } from './testing';
import type { Mapping, PresetIssue } from './types';
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
    // dedupe (non-blocking) + mapping (blocking) for p%3Aurl both reported as missing
    const urlIssues = issues.filter((i) => i.propertyId === 'p%3Aurl');
    expect(urlIssues).toHaveLength(2);
    expect(urlIssues.map((i) => i.blocking).sort()).toEqual([false, true]);
    expect(urlIssues.find((i) => !i.blocking)?.detail).toMatch(/^Duplicate check is off:/);
    // the files mapping and the screenshot target both fail
    expect(issues.filter((i) => i.propertyId === 'shots')).toHaveLength(2);
    expect(issues.find((i) => i.propertyId === 'fav')?.detail).toContain("can't write");
  });

  it('flags a dedupe property with an unusable type without blocking', () => {
    const issues = validatePreset(makePreset({ dedupe: { propertyId: 'rating' } }), resourcesSchema);
    expect(issues).toEqual([expect.objectContaining({ propertyId: 'rating', kind: 'type-changed', blocking: false })]);
    expect(issues[0]?.detail).toMatch(/^Duplicate check is off:/);
  });

  it('flags a deleted dedupe property without blocking', () => {
    const issues = validatePreset(makePreset({ dedupe: { propertyId: 'gone' } }), resourcesSchema);
    expect(issues).toEqual([expect.objectContaining({ propertyId: 'gone', kind: 'missing', blocking: false })]);
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

  it('isBlocking reads the blocking flag', () => {
    const issue = (blocking: boolean): PresetIssue => ({ propertyId: 'x', kind: 'option-missing', blocking, detail: '' });
    expect(isBlocking(issue(true))).toBe(true);
    expect(isBlocking(issue(false))).toBe(false);
    const issues = validatePreset(preset, resourcesChangedSchema);
    expect(issues.filter((i) => i.kind === 'renamed').every((i) => !i.blocking)).toBe(true);
    const mappingIds = new Set(preset.mappings.map((m) => m.propertyId));
    expect(
      issues
        .filter((i) => (i.kind === 'type-changed' || i.kind === 'missing') && !i.detail.startsWith('Duplicate check is off'))
        .every((i) => i.blocking || !mappingIds.has(i.propertyId)),
    ).toBe(true);
    const status = validatePreset(preset, resourcesChangedSchema).find((i) => i.propertyId === 'status');
    expect(status && isBlocking(status)).toBe(true);
  });

  it('refreshPropertyNames updates snapshots after a rename', () => {
    const fixed = refreshPropertyNames(preset, resourcesChangedSchema);
    expect(fixed.mappings[0]?.propertyName).toBe('Title');
    expect(validatePreset(fixed, resourcesChangedSchema).some((i) => i.kind === 'renamed')).toBe(false);
  });
});

describe('relation mappings', () => {
  const relMapping = (source: Mapping['source']): Mapping => ({
    propertyId: 'rel',
    propertyName: 'Related',
    propertyType: 'relation',
    source,
    editableInPopup: false,
  });
  const kineo = { kind: 'relation' as const, value: [{ id: 'page-kineo', title: 'Kineo Website' }] };

  it('accepts static and ask relation values on a relation property', () => {
    expect(validatePreset(makePreset({ mappings: [relMapping({ kind: 'static', value: kineo })] }), resourcesSchema)).toEqual([]);
    expect(
      validatePreset(makePreset({ mappings: [relMapping({ kind: 'ask', default: kineo, required: true })] }), resourcesSchema),
    ).toEqual([]);
  });

  it('blocks when the relation property changed type', () => {
    const schema = {
      ...resourcesSchema,
      properties: { ...resourcesSchema.properties, rel: { id: 'rel', name: 'Related', type: 'rich_text' as const } },
    };
    const issues = validatePreset(makePreset({ mappings: [relMapping({ kind: 'static', value: kineo })] }), schema);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ propertyId: 'rel', kind: 'type-changed', blocking: true });
  });

  it('blocks a property that became a relation (no extractor can fill it)', () => {
    const schema = {
      ...resourcesSchema,
      properties: { ...resourcesSchema.properties, notes: { id: 'notes', name: 'Notes', type: 'relation' as const } },
    };
    const mapping: Mapping = {
      propertyId: 'notes',
      propertyName: 'Notes',
      propertyType: 'rich_text',
      source: { kind: 'extractor', extractor: 'ogDescription' },
      editableInPopup: false,
    };
    const issues = validatePreset(makePreset({ mappings: [mapping] }), schema);
    expect(issues[0]).toMatchObject({ propertyId: 'notes', kind: 'type-changed', blocking: true });
  });
});
