import { describe, expect, it } from 'vitest';
import { pickFavicon } from './extractors/favicon';
import { fontFamilies, splitFontStack } from './extractors/fonts';
import { probeFixture } from './fixtures.test-helper';
import { getExtractor, listExtractors, runExtractors } from './registry';
import type { ExtractorId, ImageValue, RawPageData } from './types';
import { VALUE_KIND_TARGETS } from './compat-table';

const NOW = new Date('2026-10-18T12:34:56.000Z');

const ALL_IDS: ExtractorId[] = [
  'screenshot',
  'title',
  'ogTitle',
  'url',
  'canonicalUrl',
  'domain',
  'metaDescription',
  'ogDescription',
  'favicon',
  'ogImage',
  'selection',
  'fonts',
  'dateSaved',
];

function raw(partial: Partial<RawPageData> = {}): RawPageData {
  return {
    title: '',
    url: 'https://example.com/page',
    meta: {},
    links: [],
    selection: '',
    fonts: { body: '' },
    readyState: 'complete',
    ...partial,
  };
}

function run(id: ExtractorId, data: RawPageData, screenshot?: ImageValue) {
  const def = getExtractor(id);
  if (!def) throw new Error(`missing ${id}`);
  return def.extract(data, screenshot ? { now: NOW, screenshot } : { now: NOW });
}

describe('registry', () => {
  it('registers every ExtractorId with metadata', () => {
    expect(listExtractors().map((d) => d.id)).toEqual(ALL_IDS);
    for (const def of listExtractors()) {
      expect(def.label).not.toBe('');
      expect(def.description).not.toBe('');
      expect(def.compatible).toEqual(VALUE_KIND_TARGETS[def.output]);
    }
  });

  it('applies the compatibility matrix', () => {
    expect(getExtractor('title')?.compatible).toEqual(['title', 'rich_text', 'select', 'multi_select']);
    expect(getExtractor('url')?.compatible).toEqual(['url', 'rich_text', 'title']);
    expect(getExtractor('fonts')?.compatible).toEqual(['multi_select', 'rich_text']);
    expect(getExtractor('dateSaved')?.compatible).toEqual(['date']);
    expect(getExtractor('screenshot')?.compatible).toEqual(['files']);
    expect(getExtractor('favicon')?.output).toBe('image');
    expect(getExtractor('nope' as ExtractorId)).toBeUndefined();
  });

  it('runs all extractors on the rich fixture', () => {
    const data = probeFixture('rich', 'https://www.acme.example/widgets?utm_source=x');
    const shot: ImageValue = { kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 5 };
    const { values, warnings } = runExtractors(data, { now: NOW, screenshot: shot });
    expect(warnings).toEqual([]);
    expect(values).toEqual({
      screenshot: shot,
      title: { kind: 'text', value: 'Acme Widgets — The Best Widgets' },
      ogTitle: { kind: 'text', value: 'Acme Widgets' },
      url: { kind: 'url', value: 'https://www.acme.example/widgets?utm_source=x' },
      canonicalUrl: { kind: 'url', value: 'https://acme.example/widgets' },
      domain: { kind: 'text', value: 'acme.example' },
      metaDescription: { kind: 'text', value: 'Acme makes widgets for everyone.' },
      ogDescription: { kind: 'text', value: 'Widgets, beautifully made.' },
      favicon: { kind: 'image', url: 'https://www.acme.example/apple-touch-icon.png', width: 180, height: 180, mimeType: 'image/png' },
      ogImage: { kind: 'image', url: 'https://www.acme.example/images/og-card.png', width: 1200, height: 630 },
      fonts: { kind: 'list', value: ['Inter Var', 'Inter', 'Playfair Display', 'Georgia'] },
      dateSaved: { kind: 'date', value: '2026-10-18T12:34:56.000Z' },
    });
  });

  it('degrades on the bare fixture', () => {
    const data = probeFixture('bare', 'https://bare.example/');
    const { values } = runExtractors(data, { now: NOW });
    // `fonts` may contain the engine's default font (unstyled page) — not asserted.
    const keys = Object.keys(values).filter((k) => k !== 'fonts').sort();
    expect(keys).toEqual(['dateSaved', 'domain', 'favicon', 'url']);
    expect(values.favicon).toEqual({ kind: 'image', url: 'https://bare.example/favicon.ico', mimeType: 'image/x-icon' });
  });

  it('resolves relative URLs from the relative fixture', () => {
    const data = probeFixture('relative', 'https://rel.example/docs/guide/index.html');
    const { values } = runExtractors(data, { now: NOW });
    expect(values.ogImage).toEqual({ kind: 'image', url: 'https://rel.example/docs/img/cover.jpg' });
    expect(values.canonicalUrl).toEqual({ kind: 'url', value: 'https://rel.example/docs/guide/page' });
    // data: icon is skipped, svg "any" wins
    expect(values.favicon).toMatchObject({ url: 'https://rel.example/docs/guide/icons/icon.svg', mimeType: 'image/svg+xml' });
  });

  it('turns a throwing extractor into a warning', () => {
    const broken = { ...raw(), meta: null } as unknown as RawPageData;
    const { values, warnings } = runExtractors(broken, { now: NOW });
    expect(values.url).toBeDefined();
    expect(values.dateSaved).toBeDefined();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Couldn't read/);
  });

  it('with raw=null runs only context extractors', () => {
    const shot: ImageValue = { kind: 'image', dataUrl: 'data:image/jpeg;base64,AA' };
    const { values } = runExtractors(null, { now: NOW, screenshot: shot });
    expect(Object.keys(values).sort()).toEqual(['dateSaved', 'screenshot']);
  });

  it('marks only screenshot and dateSaved as not needing page data', () => {
    const contextOnly = listExtractors().filter((d) => d.needsPage === false).map((d) => d.id);
    expect(contextOnly.sort()).toEqual(['dateSaved', 'screenshot']);
  });

  it('honours `only`', () => {
    const { values } = runExtractors(raw({ title: 'T' }), { now: NOW }, { only: ['title'] });
    expect(values).toEqual({ title: { kind: 'text', value: 'T' } });
  });
});

describe('individual extractors', () => {
  it('title / ogTitle fallbacks', () => {
    expect(run('title', raw({ title: '   ' }))).toBeNull();
    expect(run('ogTitle', raw({ meta: { 'twitter:title': ' Tw ' } }))).toEqual({ kind: 'text', value: 'Tw' });
    expect(run('ogTitle', raw({ meta: { 'og:title': '', 'twitter:title': 'Tw' } }))).toEqual({ kind: 'text', value: 'Tw' });
    expect(run('ogTitle', raw())).toBeNull();
  });

  it('ogDescription falls back to twitter', () => {
    expect(run('ogDescription', raw({ meta: { 'twitter:description': 'D' } }))).toEqual({ kind: 'text', value: 'D' });
    expect(run('metaDescription', raw({ meta: { 'og:description': 'D' } }))).toBeNull();
  });

  it('url / domain / canonicalUrl', () => {
    expect(run('url', raw({ url: 'not a url' }))).toBeNull();
    expect(run('domain', raw({ url: 'https://WWW.Example.co.uk:8080/x' }))).toEqual({ kind: 'text', value: 'example.co.uk' });
    expect(run('domain', raw({ url: 'https://blog.www.example.com/' }))).toEqual({ kind: 'text', value: 'blog.www.example.com' });
    expect(run('domain', raw({ url: 'about:blank' }))).toBeNull();
    expect(run('canonicalUrl', raw({ meta: { 'og:url': '/canon' } }))).toEqual({ kind: 'url', value: 'https://example.com/canon' });
    expect(run('canonicalUrl', raw({ links: [{ rel: 'canonical', href: 'javascript:alert(1)' }] }))).toBeNull();
  });

  it('ogImage falls back to twitter:image and rejects non-http', () => {
    expect(run('ogImage', raw({ meta: { 'twitter:image': '/tw.png' } }))).toEqual({ kind: 'image', url: 'https://example.com/tw.png' });
    expect(run('ogImage', raw({ meta: { 'og:image': 'data:image/png;base64,AA' } }))).toBeNull();
  });

  it('selection keeps paragraphs but collapses spaces', () => {
    expect(run('selection', raw({ selection: '  Hello    world \n\n\n\n Second\tline  ' }))).toEqual({
      kind: 'text',
      value: 'Hello world\n\nSecond line',
    });
    expect(run('selection', raw({ selection: ' \n ' }))).toBeNull();
  });

  it('screenshot and dateSaved read the context', () => {
    expect(run('screenshot', raw())).toBeNull();
    expect(run('dateSaved', raw())).toEqual({ kind: 'date', value: NOW.toISOString() });
  });
});

describe('favicon', () => {
  it('prefers the largest icon', () => {
    const value = pickFavicon(
      raw({
        links: [
          { rel: 'shortcut icon', href: 'https://example.com/favicon.ico' },
          { rel: 'icon', href: 'https://example.com/icon-192.png' },
          { rel: 'apple-touch-icon', href: 'https://example.com/apple.png' },
        ],
      }),
    );
    expect(value?.url).toBe('https://example.com/icon-192.png');
  });

  it('uses declared sizes and ignores mask-icon', () => {
    const value = pickFavicon(
      raw({
        links: [
          { rel: 'mask-icon', href: 'https://example.com/mask.svg' },
          { rel: 'icon', href: 'https://example.com/a.png', sizes: '16x16 48x48' },
        ],
      }),
    );
    expect(value).toEqual({ kind: 'image', url: 'https://example.com/a.png', width: 48, height: 48, mimeType: 'image/png' });
  });

  it('falls back to /favicon.ico at the origin, not for non-http pages', () => {
    expect(pickFavicon(raw({ url: 'https://x.example/a/b?c' }))?.url).toBe('https://x.example/favicon.ico');
    expect(pickFavicon(raw({ url: 'about:blank' }))).toBeNull();
  });
});

describe('fonts', () => {
  it('splits stacks, strips quotes, drops generics', () => {
    expect(splitFontStack(`"Helvetica Neue", 'Segoe UI' , Arial,sans-serif`)).toEqual([
      'Helvetica Neue',
      'Segoe UI',
      'Arial',
      'sans-serif',
    ]);
    expect(splitFontStack('"Foo, Bar", Baz')).toEqual(['Foo, Bar', 'Baz']);
    expect(
      fontFamilies(['-apple-system, BlinkMacSystemFont, system-ui, "Inter"', 'inter, Georgia, serif', undefined, 'ui-monospace']),
    ).toEqual(['Inter', 'Georgia']);
  });

  it('returns null when only generic families are present', () => {
    expect(run('fonts', raw({ fonts: { body: 'system-ui, sans-serif' } }))).toBeNull();
  });
});
