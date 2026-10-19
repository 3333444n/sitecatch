import { describe, expect, it } from 'vitest';
import { fromSource, loadPage, probeFixture } from './fixtures.test-helper';
import { pageProbe, waitForReady } from './probe';

describe('pageProbe (re-created from source, like executeScript)', () => {
  it('source has no imports or module references', () => {
    const src = pageProbe.toString();
    expect(src).not.toMatch(/__vite|import\(|require\(|_?_?vi_import/);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const recreate = new Function(`return (${src})`) as () => unknown;
    expect(recreate()).toBeTypeOf('function');
  });

  it('extracts title, url, meta, links and fonts from a rich page', () => {
    const raw = probeFixture('rich', 'https://www.acme.example/widgets?utm_source=x#top');
    expect(raw.url).toBe('https://www.acme.example/widgets?utm_source=x#top');
    expect(raw.title).toContain('Acme Widgets');
    expect(raw.readyState).toBeTypeOf('string');

    // keyed by lowercased name/property, first wins
    expect(raw.meta.description).toContain('Acme makes');
    expect(raw.meta['og:title']).toBe('Acme Widgets');
    expect(raw.meta['og:image']).toBe('/images/og-card.png');
    expect(raw.meta['twitter:image']).toBe('https://cdn.acme.example/twitter.png');

    const rels = raw.links.map((l) => l.rel);
    expect(rels).toEqual(['canonical', 'icon', 'icon', 'apple-touch-icon', 'mask-icon', 'shortcut icon']);
    expect(rels).not.toContain('stylesheet');
    const apple = raw.links.find((l) => l.rel === 'apple-touch-icon') as { href: string; sizes?: string };
    expect(apple.href).toBe('https://www.acme.example/apple-touch-icon.png');
    expect(apple.sizes).toBe('180x180');

    expect(raw.fonts.body).toContain('Inter');
    expect(raw.fonts.h1).toContain('Playfair Display');
    expect(raw.fonts.h2).toContain('Inter');
    expect(raw.selection).toBe('');
  });

  it('handles a bare page', () => {
    const raw = probeFixture('bare', 'https://bare.example/');
    expect(raw.title).toBe('');
    expect(raw.meta).toEqual({});
    expect(raw.links).toEqual([]);
    expect(raw.fonts.h1).toBeUndefined();
  });

  it('resolves relative link hrefs to absolute URLs', () => {
    const raw = probeFixture('relative', 'https://rel.example/docs/guide/index.html');
    expect(raw.links.find((l) => l.rel === 'canonical')?.href).toBe('https://rel.example/docs/guide/page');
    expect(raw.links.find((l) => l.href.endsWith('icon.svg'))?.href).toBe('https://rel.example/docs/guide/icons/icon.svg');
    // meta values are passed through raw; extractors resolve them
    expect(raw.meta['og:image']).toBe('../img/cover.jpg');
  });

  it('captures and caps the selection', () => {
    const win = loadPage(`<body><p id="p">${'a'.repeat(12_000)}</p></body>`, 'https://sel.example/');
    const p = win.document.getElementById('p');
    if (!p) throw new Error('fixture');
    const range = win.document.createRange();
    range.selectNodeContents(p);
    win.getSelection().addRange(range);
    const raw = fromSource(pageProbe, win)();
    expect(raw.selection.length).toBe(10_000);
    void win.happyDOM.close();
  });
});

describe('waitForReady (re-created from source)', () => {
  it('resolves immediately when complete', async () => {
    const win = loadPage('<p>x</p>', 'https://ready.example/');
    Object.defineProperty(win.document, 'readyState', { value: 'complete', configurable: true });
    await expect(fromSource(waitForReady, win)(1000)).resolves.toBe('complete');
    void win.happyDOM.close();
  });

  it('resolves on load', async () => {
    const win = loadPage('<p>x</p>', 'https://ready.example/');
    Object.defineProperty(win.document, 'readyState', { value: 'interactive', configurable: true });
    const pending = fromSource(waitForReady, win)(4000);
    Object.defineProperty(win.document, 'readyState', { value: 'complete', configurable: true });
    win.dispatchEvent(new win.Event('load'));
    await expect(pending).resolves.toBe('complete');
    void win.happyDOM.close();
  });

  it('resolves with the current state after the timeout', async () => {
    const win = loadPage('<p>x</p>', 'https://ready.example/');
    Object.defineProperty(win.document, 'readyState', { value: 'loading', configurable: true });
    const start = Date.now();
    await expect(fromSource(waitForReady, win)(30)).resolves.toBe('loading');
    expect(Date.now() - start).toBeLessThan(2000);
    void win.happyDOM.close();
  });
});
