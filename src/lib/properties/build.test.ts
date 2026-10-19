import { describe, expect, it } from 'vitest';
import { resolveInitialValues } from '@/lib/presets/resolve';
import { allResourcesMappings, makeCapture, makePreset, resourcesChangedSchema, resourcesSchema } from '@/lib/presets/testing';
import type { FormValues, Mapping } from '@/lib/presets/types';
import type { NotionCreatePageBody, NotionUpdatePageBody } from '@/lib/notion/types';
import { buildPageExtras, buildProperties, formatUtcOffset, withUtcOffset } from './build';

const preset = makePreset({ mappings: allResourcesMappings() });

function values(overrides: FormValues = {}): FormValues {
  return {
    ...resolveInitialValues(preset, makeCapture()),
    rating: { kind: 'number', value: 4.5 },
    email: { kind: 'text', value: 'me@example.com' },
    phone: { kind: 'text', value: '+1 415 555 0123' },
    ...overrides,
  };
}

describe('buildProperties', () => {
  it('produces exact Notion JSON for every writable type, keyed by id', () => {
    const { properties, warnings } = buildProperties(preset, values(), resourcesSchema, { screenshotUploadId: 'up-1' });
    expect(warnings).toEqual([]);
    expect(properties).toEqual({
      title: { title: [{ type: 'text', text: { content: 'Example — OG' } }] },
      'p%3Aurl': { url: 'https://example.com/article?utm_source=x' },
      notes: { rich_text: [{ type: 'text', text: { content: 'A description' } }] },
      rating: { number: 4.5 },
      kind: { select: { name: 'Tool' } },
      tags: { multi_select: [{ name: 'dev' }] },
      status: { status: { name: 'Read' } },
      saved: { date: { start: '2026-10-18T12:00:00.000Z' } },
      shots: { files: [{ type: 'file_upload', file_upload: { id: 'up-1' }, name: 'screenshot.jpg' }] },
      fav: { checkbox: true },
      email: { email: 'me@example.com' },
      phone: { phone_number: '+1 415 555 0123' },
    });
  });

  it('skips empty values but keeps checkbox false', () => {
    const { properties } = buildProperties(
      preset,
      values({
        notes: { kind: 'text', value: '   ' },
        rating: { kind: 'number', value: null },
        kind: { kind: 'select', value: null },
        tags: { kind: 'multi_select', value: [] },
        saved: { kind: 'date', value: null },
        email: { kind: 'text', value: '' },
        fav: { kind: 'checkbox', value: false },
      }),
      resourcesSchema,
      { screenshotUploadId: 'up-1' },
    );
    for (const id of ['notes', 'rating', 'kind', 'tags', 'saved', 'email']) expect(properties).not.toHaveProperty(id);
    expect(properties.fav).toEqual({ checkbox: false });
  });

  it('chunks long rich text and truncates past 100 chunks', () => {
    const long = buildProperties(preset, values({ notes: { kind: 'text', value: 'x'.repeat(4001) } }), resourcesSchema);
    const rt = long.properties.notes as { rich_text: { text: { content: string } }[] };
    expect(rt.rich_text.map((r) => r.text.content.length)).toEqual([2000, 2000, 1]);

    const huge = buildProperties(preset, values({ notes: { kind: 'text', value: 'x'.repeat(200_001) } }), resourcesSchema);
    expect((huge.properties.notes as { rich_text: unknown[] }).rich_text).toHaveLength(100);
    expect(huge.warnings.some((w) => w.includes('Notes'))).toBe(true);
  });

  it('drops invalid and overlong URLs with warnings', () => {
    const bad = buildProperties(preset, values({ 'p%3Aurl': { kind: 'text', value: 'not a url' } }), resourcesSchema);
    expect(bad.properties).not.toHaveProperty('p%3Aurl');
    expect(bad.warnings).toHaveLength(2); // url + missing screenshot
    const long = buildProperties(
      preset,
      values({ 'p%3Aurl': { kind: 'text', value: `https://e.com/${'a'.repeat(2000)}` } }),
      resourcesSchema,
      { screenshotUploadId: 'u' },
    );
    expect(long.properties).not.toHaveProperty('p%3Aurl');
    expect(long.warnings[0]).toContain('2000');
  });

  it('sanitizes select and multi_select names, dedupes and caps multi_select', () => {
    const many = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const { properties, warnings } = buildProperties(
      preset,
      values({
        kind: { kind: 'select', value: 'Tools, apps' },
        tags: { kind: 'multi_select', value: ['a,b', 'a b', ' ', ...many] },
      }),
      resourcesSchema,
      { screenshotUploadId: 'u' },
    );
    expect(properties.kind).toEqual({ select: { name: 'Tools apps' } });
    const ms = (properties.tags as { multi_select: { name: string }[] }).multi_select;
    expect(ms).toHaveLength(100);
    expect(ms[0]).toEqual({ name: 'a b' });
    expect(ms[1]).toEqual({ name: 't0' });
    expect(warnings.some((w) => w.includes('100'))).toBe(true);
  });

  it('writes date ranges and rejects overlong email/phone', () => {
    const { properties, warnings } = buildProperties(
      preset,
      values({
        saved: { kind: 'date', value: { start: '2026-01-01', end: '2026-01-05' } },
        email: { kind: 'text', value: `${'a'.repeat(200)}@x.com` },
      }),
      resourcesSchema,
      { screenshotUploadId: 'u' },
    );
    expect(properties.saved).toEqual({ date: { start: '2026-01-01', end: '2026-01-05' } });
    expect(properties).not.toHaveProperty('email');
    expect(warnings[0]).toContain('Contact');
  });

  it('builds external files and skips screenshots without an upload', () => {
    const { properties, warnings } = buildProperties(
      preset,
      values({
        shots: {
          kind: 'files',
          value: [{ kind: 'screenshot' }, { kind: 'external', url: 'https://example.com/a/og.png' }, { kind: 'external', url: 'javascript:alert(1)' }],
        },
      }),
      resourcesSchema,
    );
    expect(properties.shots).toEqual({
      files: [{ type: 'external', name: 'og.png', external: { url: 'https://example.com/a/og.png' } }],
    });
    expect(warnings).toHaveLength(2);
  });

  it('attaches the screenshot to preset.screenshot.filesPropertyId once', () => {
    const p = makePreset({
      mappings: allResourcesMappings().filter((m) => m.propertyId !== 'shots'),
      screenshot: { filesPropertyId: 'shots', bodyImage: false },
    });
    const v = resolveInitialValues(p, makeCapture());
    const { properties } = buildProperties(p, v, resourcesSchema, { screenshotUploadId: 'up-9' });
    expect(properties.shots).toEqual({ files: [{ type: 'file_upload', file_upload: { id: 'up-9' }, name: 'screenshot.jpg' }] });

    // also mapped → not duplicated
    const both = makePreset({ mappings: allResourcesMappings(), screenshot: { filesPropertyId: 'shots', bodyImage: false } });
    const r = buildProperties(both, resolveInitialValues(both, makeCapture()), resourcesSchema, { screenshotUploadId: 'up-9' });
    expect((r.properties.shots as { files: unknown[] }).files).toHaveLength(1);
  });

  it('skips deleted, read-only and mismatched properties with warnings', () => {
    const { properties, warnings } = buildProperties(preset, values(), resourcesChangedSchema, { screenshotUploadId: 'u' });
    expect(properties).not.toHaveProperty('p%3Aurl'); // deleted
    expect(properties).not.toHaveProperty('fav'); // now formula
    expect(properties).not.toHaveProperty('rating'); // number value into rich_text
    expect(properties).not.toHaveProperty('shots'); // files value into rich_text
    expect(properties.title).toBeDefined();
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });

  it('ignores values for unmapped properties', () => {
    const m: Mapping[] = allResourcesMappings().slice(0, 1);
    const { properties } = buildProperties(makePreset({ mappings: m }), values(), resourcesSchema);
    expect(Object.keys(properties)).toEqual(['title']);
  });
});

describe('buildPageExtras', () => {
  const capture = makeCapture();

  it('returns nothing by default', () => {
    expect(buildPageExtras(makePreset(), capture, 'u')).toEqual({});
  });

  it('builds favicon icon, screenshot cover and body image', () => {
    const p = makePreset({ icon: 'favicon', cover: 'screenshot', screenshot: { filesPropertyId: null, bodyImage: true } });
    expect(buildPageExtras(p, capture, 'up-1')).toEqual({
      icon: { type: 'external', external: { url: 'https://example.com/favicon.ico' } },
      cover: { type: 'file_upload', file_upload: { id: 'up-1' } },
      children: [{ object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: 'up-1' } } }],
    });
  });

  it('uses og:image as external cover', () => {
    expect(buildPageExtras(makePreset({ cover: 'ogImage' }), capture)).toEqual({
      cover: { type: 'external', external: { url: 'https://example.com/og.png' } },
    });
  });

  it('skips non-http favicons and screenshot extras without upload', () => {
    const c = makeCapture();
    c.values.favicon = { kind: 'image', url: 'data:image/png;base64,AAA' };
    const p = makePreset({ icon: 'favicon', cover: 'screenshot', screenshot: { filesPropertyId: null, bodyImage: true } });
    expect(buildPageExtras(p, c)).toEqual({});
  });
});

describe('date offsets', () => {
  it('formats UTC offsets', () => {
    expect(formatUtcOffset(0)).toBe('+00:00');
    expect(formatUtcOffset(120)).toBe('+02:00');
    expect(formatUtcOffset(-330)).toBe('-05:30');
    expect(formatUtcOffset(345)).toBe('+05:45');
  });

  it('appends the offset only to date-times without one', () => {
    expect(withUtcOffset('2026-10-18T09:30', 120)).toBe('2026-10-18T09:30+02:00');
    expect(withUtcOffset('2026-10-18T09:30:15', -300)).toBe('2026-10-18T09:30:15-05:00');
    expect(withUtcOffset('2026-10-18', 120)).toBe('2026-10-18');
    expect(withUtcOffset('2026-10-18T09:30:00.000Z', 120)).toBe('2026-10-18T09:30:00.000Z');
    expect(withUtcOffset('2026-10-18T09:30+01:00', 120)).toBe('2026-10-18T09:30+01:00');
  });

  it('defaults to the local offset at that date', () => {
    const expected = formatUtcOffset(-new Date('2026-01-15T10:00').getTimezoneOffset());
    expect(withUtcOffset('2026-01-15T10:00')).toBe(`2026-01-15T10:00${expected}`);
  });

  it('buildProperties offsets date-time start and end', () => {
    const { properties } = buildProperties(
      preset,
      values({ saved: { kind: 'date', value: { start: '2026-10-18T09:00', end: '2026-10-18T10:30' } } }),
      resourcesSchema,
      { utcOffsetMinutes: 120 },
    );
    expect(properties.saved).toEqual({
      date: { start: '2026-10-18T09:00+02:00', end: '2026-10-18T10:30+02:00' },
    });
  });
});

describe('page body compatibility', () => {
  it('plugs builder output into create/update page bodies without casts', () => {
    const p = makePreset({ mappings: allResourcesMappings(), icon: 'favicon', cover: 'screenshot', screenshot: { filesPropertyId: null, bodyImage: true } });
    const { properties } = buildProperties(p, values(), resourcesSchema, { screenshotUploadId: 'up-1' });
    const extras = buildPageExtras(p, makeCapture(), 'up-1');
    const create: NotionCreatePageBody = {
      parent: { type: 'data_source_id', data_source_id: resourcesSchema.id },
      properties,
      ...extras,
    };
    const { children: _children, ...updateExtras } = extras;
    const update: NotionUpdatePageBody = { properties, ...updateExtras };
    expect(create.children).toHaveLength(1);
    expect(update.properties).toBe(properties);
  });
});
