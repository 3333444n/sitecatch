/** Test-only helpers: schema fixtures and preset/capture builders. Not imported by app code. */
import favJson from '../../../test/fixtures/schemas/fav-websites.json';
import changedJson from '../../../test/fixtures/schemas/resources-changed.json';
import resourcesJson from '../../../test/fixtures/schemas/resources.json';
import type { CaptureResult } from '@/lib/extract/types';
import type { DataSourceSchema } from '@/lib/notion/types';
import type { Mapping, Preset } from './types';

export const resourcesSchema = resourcesJson as unknown as DataSourceSchema;
export const resourcesChangedSchema = changedJson as unknown as DataSourceSchema;
export const favWebsitesSchema = favJson as unknown as DataSourceSchema;

export function makePreset(overrides: Partial<Preset> = {}): Preset {
  return {
    schemaVersion: 1,
    id: 'preset-1',
    name: 'Resources',
    dataSourceId: 'ds-resources',
    dataSourceName: 'Resources',
    mappings: [],
    screenshot: { filesPropertyId: null, bodyImage: false },
    cover: 'none',
    icon: 'none',
    dedupe: { propertyId: null },
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A mapping for every writable property of the resources fixture. */
export function allResourcesMappings(): Mapping[] {
  return [
    { propertyId: 'title', propertyName: 'Name', propertyType: 'title', source: { kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] }, editableInPopup: true },
    { propertyId: 'p%3Aurl', propertyName: 'URL', propertyType: 'url', source: { kind: 'extractor', extractor: 'url' }, editableInPopup: false },
    { propertyId: 'notes', propertyName: 'Notes', propertyType: 'rich_text', source: { kind: 'extractor', extractor: 'metaDescription' }, editableInPopup: true },
    { propertyId: 'rating', propertyName: 'Rating', propertyType: 'number', source: { kind: 'ask' }, editableInPopup: true },
    { propertyId: 'kind', propertyName: 'Kind', propertyType: 'select', source: { kind: 'static', value: { kind: 'select', value: 'Tool' } }, editableInPopup: true },
    { propertyId: 'tags', propertyName: 'Tags', propertyType: 'multi_select', source: { kind: 'ask', default: { kind: 'multi_select', value: ['dev'] } }, editableInPopup: true },
    { propertyId: 'status', propertyName: 'Status', propertyType: 'status', source: { kind: 'static', value: { kind: 'select', value: 'Read' } }, editableInPopup: false },
    { propertyId: 'saved', propertyName: 'Saved', propertyType: 'date', source: { kind: 'extractor', extractor: 'dateSaved' }, editableInPopup: false },
    { propertyId: 'shots', propertyName: 'Screenshots', propertyType: 'files', source: { kind: 'extractor', extractor: 'screenshot' }, editableInPopup: false },
    { propertyId: 'fav', propertyName: 'Favorite', propertyType: 'checkbox', source: { kind: 'ask', default: { kind: 'checkbox', value: true } }, editableInPopup: true },
    { propertyId: 'email', propertyName: 'Contact', propertyType: 'email', source: { kind: 'ask' }, editableInPopup: true },
    { propertyId: 'phone', propertyName: 'Phone', propertyType: 'phone_number', source: { kind: 'ask' }, editableInPopup: true },
  ];
}

export function makeCapture(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    tabId: 1,
    capturedAt: '2026-10-18T12:00:00.000Z',
    url: 'https://example.com/article?utm_source=x',
    title: 'Example article',
    restricted: false,
    values: {
      title: { kind: 'text', value: 'Example article' },
      ogTitle: { kind: 'text', value: 'Example — OG' },
      url: { kind: 'url', value: 'https://example.com/article?utm_source=x' },
      canonicalUrl: { kind: 'url', value: 'https://example.com/article' },
      domain: { kind: 'text', value: 'example.com' },
      metaDescription: { kind: 'text', value: 'A description' },
      favicon: { kind: 'image', url: 'https://example.com/favicon.ico' },
      ogImage: { kind: 'image', url: 'https://example.com/og.png' },
      screenshot: { kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA', mimeType: 'image/jpeg' },
      fonts: { kind: 'list', value: ['Inter', 'Georgia'] },
      dateSaved: { kind: 'date', value: '2026-10-18T12:00:00.000Z' },
    },
    warnings: [],
    ...overrides,
  };
}
