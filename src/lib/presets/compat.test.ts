import { describe, expect, it } from 'vitest';
import { WRITABLE_PROPERTY_TYPES } from '@/lib/notion/types';
import { listExtractors } from '@/lib/extract/registry';
import {
  compatibleExtractors,
  EXTRACTOR_IDS,
  EXTRACTOR_OUTPUT,
  formValueKindFor,
  isCompatible,
  supportsAsk,
  supportsStatic,
} from './compat';

describe('compat matrix', () => {
  it('covers all 13 v0 extractors', () => {
    expect(EXTRACTOR_IDS).toHaveLength(13);
  });

  it('agrees with every ExtractorDef (output kind and compatible types)', () => {
    for (const def of listExtractors()) {
      expect(EXTRACTOR_OUTPUT[def.id]).toBe(def.output);
      for (const t of WRITABLE_PROPERTY_TYPES) {
        expect(isCompatible(def.id, t)).toBe(def.compatible.includes(t));
      }
    }
  });

  it('maps image extractors only to files', () => {
    expect(compatibleExtractors('files').sort()).toEqual(['favicon', 'ogImage', 'screenshot']);
    expect(isCompatible('screenshot', 'rich_text')).toBe(false);
  });

  it('allows text extractors into title/rich_text/select/multi_select', () => {
    for (const t of ['title', 'rich_text', 'select', 'multi_select'] as const) {
      expect(isCompatible('ogTitle', t)).toBe(true);
    }
    expect(isCompatible('ogTitle', 'url')).toBe(false);
    expect(isCompatible('ogTitle', 'status')).toBe(false);
  });

  it('allows url extractors into url/rich_text/title', () => {
    expect(compatibleExtractors('url').sort()).toEqual(['canonicalUrl', 'url']);
    expect(isCompatible('canonicalUrl', 'title')).toBe(true);
    expect(isCompatible('url', 'select')).toBe(false);
  });

  it('handles list and date', () => {
    expect(isCompatible('fonts', 'multi_select')).toBe(true);
    expect(isCompatible('fonts', 'rich_text')).toBe(true);
    expect(isCompatible('fonts', 'select')).toBe(false);
    expect(compatibleExtractors('date')).toEqual(['dateSaved']);
  });

  it('never maps extractors to read-only or extractor-less types', () => {
    expect(compatibleExtractors('formula')).toEqual([]);
    expect(compatibleExtractors('created_time')).toEqual([]);
    expect(compatibleExtractors('number')).toEqual([]);
    expect(compatibleExtractors('checkbox')).toEqual([]);
  });

  it('ask/static only for writable types (no ask for files)', () => {
    for (const t of WRITABLE_PROPERTY_TYPES) expect(supportsStatic(t)).toBe(true);
    expect(supportsAsk('files')).toBe(false);
    expect(supportsAsk('status')).toBe(true);
    expect(supportsAsk('relation')).toBe(false);
    expect(supportsStatic('rollup')).toBe(false);
  });

  it('maps property types to form kinds', () => {
    expect(formValueKindFor('email')).toBe('text');
    expect(formValueKindFor('status')).toBe('select');
    expect(formValueKindFor('files')).toBe('files');
  });
});
