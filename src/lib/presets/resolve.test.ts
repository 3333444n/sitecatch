import { describe, expect, it } from 'vitest';
import { extractedToFormValue, resolveInitialValues } from './resolve';
import { allResourcesMappings, makeCapture, makePreset } from './testing';
import type { Mapping } from './types';

describe('resolveInitialValues', () => {
  it('resolves every mapping of the resources preset', () => {
    const values = resolveInitialValues(makePreset({ mappings: allResourcesMappings() }), makeCapture());
    expect(values).toEqual({
      title: { kind: 'text', value: 'Example — OG' },
      'p%3Aurl': { kind: 'text', value: 'https://example.com/article?utm_source=x' },
      notes: { kind: 'text', value: 'A description' },
      rating: { kind: 'number', value: null },
      kind: { kind: 'select', value: 'Tool' },
      tags: { kind: 'multi_select', value: ['dev'] },
      status: { kind: 'select', value: 'Read' },
      saved: { kind: 'date', value: { start: '2026-10-18T12:00:00.000Z' } },
      shots: { kind: 'files', value: [{ kind: 'screenshot' }] },
      fav: { kind: 'checkbox', value: true },
      email: { kind: 'text', value: '' },
      phone: { kind: 'text', value: '' },
    });
  });

  it('uses fallbacks when the primary extractor is empty', () => {
    const capture = makeCapture();
    delete capture.values.ogTitle;
    const values = resolveInitialValues(makePreset({ mappings: allResourcesMappings() }), capture);
    expect(values.title).toEqual({ kind: 'text', value: 'Example article' });
  });

  it('synthesizes url/title/date on restricted pages', () => {
    const capture = makeCapture({ restricted: true, values: {} });
    const values = resolveInitialValues(makePreset({ mappings: allResourcesMappings() }), capture);
    expect(values.title).toEqual({ kind: 'text', value: 'Example article' });
    expect(values['p%3Aurl']).toEqual({ kind: 'text', value: capture.url });
    expect(values.saved).toEqual({ kind: 'date', value: { start: capture.capturedAt } });
    expect(values.shots).toEqual({ kind: 'files', value: [] });
    expect(values.notes).toEqual({ kind: 'text', value: '' });
  });

  it('ignores defaults/statics of the wrong kind', () => {
    const m: Mapping[] = [
      { propertyId: 'n', propertyName: 'N', propertyType: 'number', source: { kind: 'ask', default: { kind: 'text', value: 'x' } }, editableInPopup: true },
      { propertyId: 's', propertyName: 'S', propertyType: 'select', source: { kind: 'static', value: { kind: 'text', value: 'x' } }, editableInPopup: true },
    ];
    expect(resolveInitialValues(makePreset({ mappings: m }), makeCapture())).toEqual({
      n: { kind: 'number', value: null },
      s: { kind: 'select', value: null },
    });
  });

  it('maps fonts and og:image', () => {
    const m: Mapping[] = [
      { propertyId: 'f', propertyName: 'F', propertyType: 'multi_select', source: { kind: 'extractor', extractor: 'fonts' }, editableInPopup: true },
      { propertyId: 'r', propertyName: 'R', propertyType: 'rich_text', source: { kind: 'extractor', extractor: 'fonts' }, editableInPopup: true },
      { propertyId: 'i', propertyName: 'I', propertyType: 'files', source: { kind: 'extractor', extractor: 'ogImage' }, editableInPopup: true },
      { propertyId: 'd', propertyName: 'D', propertyType: 'select', source: { kind: 'extractor', extractor: 'domain' }, editableInPopup: true },
    ];
    expect(resolveInitialValues(makePreset({ mappings: m }), makeCapture())).toEqual({
      f: { kind: 'multi_select', value: ['Inter', 'Georgia'] },
      r: { kind: 'text', value: 'Inter, Georgia' },
      i: { kind: 'files', value: [{ kind: 'external', url: 'https://example.com/og.png', name: 'og.png' }] },
      d: { kind: 'select', value: 'example.com' },
    });
  });
});

describe('extractedToFormValue', () => {
  it('converts text to multi_select and url to title', () => {
    expect(extractedToFormValue({ kind: 'text', value: ' a ' }, 'title', 'multi_select')).toEqual({ kind: 'multi_select', value: ['a'] });
    expect(extractedToFormValue({ kind: 'url', value: 'https://x.y' }, 'url', 'title')).toEqual({ kind: 'text', value: 'https://x.y' });
  });
  it('returns null for empty values and screenshots without data', () => {
    expect(extractedToFormValue({ kind: 'text', value: '  ' }, 'title', 'title')).toBeNull();
    expect(extractedToFormValue({ kind: 'image' }, 'screenshot', 'files')).toBeNull();
    expect(extractedToFormValue({ kind: 'list', value: [] }, 'fonts', 'multi_select')).toBeNull();
  });
});
