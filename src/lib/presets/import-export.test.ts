import { describe, expect, it } from 'vitest';
import { exportPresets, parseImport } from './import-export';
import { migratePreset } from './migrate';
import { allResourcesMappings, makePreset } from './testing';

const presets = [
  makePreset({ id: 'a', mappings: allResourcesMappings() }),
  makePreset({ id: 'b', name: 'B', cover: 'ogImage', icon: 'favicon' }),
];

function wrap(list: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'sitecatch-presets', version: 1, exportedAt: 'x', presets: list, ...extra });
}

describe('export/import', () => {
  it('round-trips', () => {
    const json = exportPresets(presets, new Date('2026-01-02T00:00:00Z'));
    expect(JSON.parse(json)).toMatchObject({ format: 'sitecatch-presets', version: 1, exportedAt: '2026-01-02T00:00:00.000Z' });
    const res = parseImport(json, { regenerateIds: 'never' });
    expect(res).toEqual({ ok: true, data: presets });
  });

  it('regenerates ids on conflict only', () => {
    const res = parseImport(exportPresets(presets), { existingIds: ['a'] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]?.id).not.toBe('a');
    expect(res.data[1]?.id).toBe('b');
  });

  it('regenerates duplicate ids within the same file', () => {
    const res = parseImport(wrap([presets[1], presets[1]]));
    expect(res.ok && res.data[0]?.id !== res.data[1]?.id).toBe(true);
  });

  it('always regenerates when asked', () => {
    const res = parseImport(exportPresets(presets), { regenerateIds: 'always' });
    expect(res.ok && res.data.every((p) => p.id !== 'a' && p.id !== 'b')).toBe(true);
  });

  it('drops unknown extra keys', () => {
    const res = parseImport(wrap([{ ...presets[1], evil: '<script>' }]));
    expect(res.ok && 'evil' in (res.data[0] ?? {})).toBe(false);
  });

  const bad: [string, string][] = [
    ['not json', '{nope'],
    ['not an object', '[]'],
    ['wrong format', wrap([], { format: 'other' })],
    ['wrong version', wrap([], { version: 2 })],
    ['presets not array', wrap({})],
    ['preset missing id', wrap([{ ...presets[1], id: undefined }])],
    ['bad cover', wrap([{ ...presets[1], cover: 'video' }])],
    ['unknown extractor', wrap([makePreset({ mappings: [{ ...allResourcesMappings()[0], source: { kind: 'extractor', extractor: 'evil' } }] as never })])],
    ['bad property type', wrap([makePreset({ mappings: [{ ...allResourcesMappings()[0], propertyType: 'formula' }] as never })])],
    ['bad static value', wrap([makePreset({ mappings: [{ ...allResourcesMappings()[0], source: { kind: 'static', value: { kind: 'number', value: 'x' } } }] as never })])],
    ['bad file ref', wrap([makePreset({ mappings: [{ ...allResourcesMappings()[0], source: { kind: 'static', value: { kind: 'files', value: [{ kind: 'external' }] } } }] as never })])],
    ['newer schemaVersion', wrap([{ ...presets[1], schemaVersion: 2 }])],
    ['null preset', wrap([null])],
  ];
  it.each(bad)('rejects %s', (_name, json) => {
    const res = parseImport(json);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('validation');
      expect(res.error.message).not.toBe('');
    }
  });
});

describe('migratePreset', () => {
  it('is identity for v1', () => {
    expect(migratePreset(presets[0])).toEqual({ ok: true, data: presets[0] });
  });

  it('rejects newer versions with an update hint', () => {
    const res = migratePreset({ ...presets[0], schemaVersion: 9 });
    expect(!res.ok && res.error.message).toContain('newer version');
  });

  it('rejects missing schemaVersion', () => {
    expect(migratePreset({ id: 'x' }).ok).toBe(false);
  });
});
