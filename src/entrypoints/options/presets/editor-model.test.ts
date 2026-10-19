import { describe, expect, it } from 'vitest';
import { makePreset, resourcesChangedSchema, resourcesSchema } from '@/lib/presets/testing';
import type { Mapping } from '@/lib/presets/types';
import {
  availableSourceKinds,
  changeSourceKind,
  dedupeCandidates,
  defaultMapping,
  editorExtractors,
  editorIssues,
  normalizeForSave,
  pruneToSchema,
  readOnlyProperties,
  setScreenshotProperty,
  upsertMapping,
  writableProperties,
  type WritableProperty,
} from './editor-model';

function prop(id: string): WritableProperty {
  const p = writableProperties(resourcesSchema).find((x) => x.id === id);
  if (!p) throw new Error(`no property ${id}`);
  return p;
}

describe('editor compatibility filtering', () => {
  it('offers fonts for multi_select but not for date', () => {
    expect(editorExtractors('multi_select')).toContain('fonts');
    expect(editorExtractors('date')).not.toContain('fonts');
    expect(editorExtractors('date')).toEqual(['dateSaved']);
  });

  it('never offers the screenshot extractor for files properties', () => {
    expect(editorExtractors('files')).toEqual(['favicon', 'ogImage']);
  });

  it('limits source kinds by type', () => {
    expect(availableSourceKinds('files')).toEqual(['extractor']);
    expect(availableSourceKinds('number')).toEqual(['ask', 'static']);
    expect(availableSourceKinds('title')).toEqual(['extractor', 'ask', 'static']);
    expect(availableSourceKinds('relation')).toEqual([]);
  });

  it('splits writable and read-only properties, title first', () => {
    expect(writableProperties(resourcesSchema)[0]?.id).toBe('title');
    expect(readOnlyProperties(resourcesSchema).map((p) => p.id).sort()).toEqual(['created', 'rel']);
    expect(dedupeCandidates(resourcesSchema)[0]?.type).toBe('url');
  });
});

describe('defaults and edits', () => {
  it('picks sensible default sources', () => {
    expect(defaultMapping(prop('title')).source).toEqual({ kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] });
    expect(defaultMapping(prop('saved')).source).toEqual({ kind: 'extractor', extractor: 'dateSaved' });
    expect(defaultMapping(prop('tags')).source).toEqual({ kind: 'ask' });
    expect(defaultMapping(prop('tags')).editableInPopup).toBe(true);
    expect(defaultMapping(prop('rating')).source).toEqual({ kind: 'ask' });
  });

  it('switches source kinds with an empty value for static', () => {
    const m = defaultMapping(prop('kind'));
    expect(changeSourceKind(m, prop('kind'), 'static').source).toEqual({ kind: 'static', value: { kind: 'select', value: null } });
    expect(changeSourceKind(m, prop('kind'), 'extractor').source).toEqual({ kind: 'extractor', extractor: 'title' });
  });

  it('makes the screenshot files property canonical (removes a mapping on it)', () => {
    const files: Mapping = { ...defaultMapping(prop('shots')), source: { kind: 'extractor', extractor: 'screenshot' } };
    const p = setScreenshotProperty(upsertMapping(makePreset(), files), 'shots');
    expect(p.screenshot.filesPropertyId).toBe('shots');
    expect(p.mappings).toEqual([]);
    expect(setScreenshotProperty(p, null).screenshot.filesPropertyId).toBeNull();
  });

  it('prunes mappings and references missing from a new schema', () => {
    const p = makePreset({
      mappings: [defaultMapping(prop('title')), defaultMapping(prop('p%3Aurl'))],
      screenshot: { filesPropertyId: 'shots', bodyImage: false },
      dedupe: { propertyId: 'p%3Aurl' },
    });
    const pruned = pruneToSchema(p, resourcesChangedSchema);
    expect(pruned.mappings.map((m) => m.propertyId)).toEqual(['title']);
    expect(pruned.screenshot.filesPropertyId).toBe('shots'); // still exists (as rich_text) → validation flags it
    expect(pruned.dedupe.propertyId).toBeNull();
  });

  it('drops empty ask defaults on save and trims the name', () => {
    const m: Mapping = { ...defaultMapping(prop('tags')), source: { kind: 'ask', default: { kind: 'multi_select', value: [] }, required: false } };
    const out = normalizeForSave(makePreset({ name: '  Res  ', mappings: [m] }));
    expect(out.name).toBe('Res');
    expect(out.mappings[0]?.source).toEqual({ kind: 'ask' });
  });
});

describe('editorIssues', () => {
  it('adds editor-only blocking issues for an empty name and empty fixed values', () => {
    const m: Mapping = { ...defaultMapping(prop('kind')), source: { kind: 'static', value: { kind: 'select', value: null } } };
    const issues = editorIssues(makePreset({ name: ' ', mappings: [m] }), resourcesSchema);
    expect(issues.filter((i) => i.blocking).map((i) => i.detail)).toEqual([
      'Give the preset a name.',
      'Set a fixed value for “Kind”, or choose another source.',
    ]);
  });

  it('accepts an unchecked checkbox as a fixed value', () => {
    const m: Mapping = { ...defaultMapping(prop('fav')), source: { kind: 'static', value: { kind: 'checkbox', value: false } } };
    expect(editorIssues(makePreset({ mappings: [m] }), resourcesSchema)).toEqual([]);
  });
});
