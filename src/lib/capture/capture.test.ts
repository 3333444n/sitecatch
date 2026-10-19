import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Window } from 'happy-dom';
import { ok, err } from '@/lib/errors';
import { FIXTURES, fromSource, loadPage } from '@/lib/extract/fixtures.test-helper';
import { captureTab, type CaptureDeps } from './capture';

const NOW = new Date('2026-10-18T08:00:00.000Z');
const SETTINGS = { captureDelayMs: 0, jpegQuality: 0.85 };
const SHOT = 'data:image/jpeg;base64,/9j/4AAQ';

const windows: Window[] = [];
afterEach(() => {
  for (const w of windows.splice(0)) void w.happyDOM.close();
});

/** Deps whose executeScript runs the serialized func inside a happy-dom page. */
function depsFor(html: string | null, url: string, overrides: Partial<CaptureDeps> = {}): CaptureDeps & { sleep: ReturnType<typeof vi.fn> } {
  let win: Window | null = null;
  if (html !== null) {
    win = loadPage(html, url);
    Object.defineProperty(win.document, 'readyState', { value: 'complete', configurable: true });
    windows.push(win);
  }
  const sleep = vi.fn(() => Promise.resolve());
  return {
    executeScript: <A extends unknown[], R>(_tabId: number, func: (...args: A) => R, args: A): Promise<Awaited<R>> => {
      if (win === null) return Promise.reject(new Error('Missing host permission for the tab'));
      return Promise.resolve(fromSource(func as (...a: never[]) => unknown, win)(...(args as unknown as never[])) as Awaited<R>);
    },
    captureVisibleTab: vi.fn(() => Promise.resolve(SHOT)),
    sleep,
    now: () => NOW,
    compress: (dataUrl) =>
      Promise.resolve(
        ok({ blob: new Blob(['x']), dataUrl, width: 1600, height: 900, bytes: 1234, reducedToFit: false }),
      ),
    ...overrides,
  } as CaptureDeps & { sleep: ReturnType<typeof vi.fn> };
}

const tab = (url: string, title = 'Tab title') => ({ id: 7, windowId: 3, url, title });

describe('captureTab', () => {
  it('captures a normal page end-to-end', async () => {
    const url = 'https://www.acme.example/widgets';
    const deps = depsFor(FIXTURES.rich, url);
    const result = await captureTab(tab(url), { captureDelayMs: 250, jpegQuality: 0.8 }, deps);

    expect(result).toMatchObject({
      tabId: 7,
      capturedAt: NOW.toISOString(),
      url,
      restricted: false,
      warnings: [],
    });
    expect(result.title).toContain('Acme Widgets');
    expect(result.values.ogTitle).toEqual({ kind: 'text', value: 'Acme Widgets' });
    expect(result.values.screenshot).toEqual({
      kind: 'image',
      dataUrl: SHOT,
      width: 1600,
      height: 900,
      bytes: 1234,
      mimeType: 'image/jpeg',
    });
    expect(deps.sleep).toHaveBeenCalledWith(250);
    expect(deps.captureVisibleTab).toHaveBeenCalledWith(3, { format: 'jpeg', quality: 80 });
  });

  it('skips the delay when 0', async () => {
    const deps = depsFor(FIXTURES.bare, 'https://bare.example/');
    await captureTab(tab('https://bare.example/'), SETTINGS, deps);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('short-circuits known restricted pages with url/title fallback', async () => {
    const deps = depsFor(FIXTURES.rich, 'https://addons.mozilla.org/');
    const result = await captureTab(tab('https://addons.mozilla.org/en-US/firefox/', 'Add-ons'), SETTINGS, deps);
    expect(result.restricted).toBe(true);
    expect(result.restrictedReason).toMatch(/add-on store/);
    expect(Object.keys(result.values).sort()).toEqual(['dateSaved', 'domain', 'title', 'url']);
    expect(result.values.title).toEqual({ kind: 'text', value: 'Add-ons' });
    expect(deps.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('uses the original URL for Reader View', async () => {
    const deps = depsFor(null, '');
    const result = await captureTab(tab('about:reader?url=https%3A%2F%2Fblog.example%2Fp', 'Post'), SETTINGS, deps);
    expect(result.restricted).toBe(true);
    expect(result.url).toBe('https://blog.example/p');
    expect(result.values.url).toEqual({ kind: 'url', value: 'https://blog.example/p' });
    expect(result.values.domain).toEqual({ kind: 'text', value: 'blog.example' });
  });

  it('keeps the screenshot when scripting fails (unknown restriction)', async () => {
    const deps = depsFor(null, '');
    const result = await captureTab(tab('https://quarantined.example/x', 'Q'), SETTINGS, deps);
    expect(result.restricted).toBe(false);
    expect(result.values.screenshot).toBeDefined();
    expect(result.values.title).toEqual({ kind: 'text', value: 'Q' });
    expect(result.values.ogTitle).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/Couldn't read this page's details/);
  });

  it('falls back to restricted when nothing works', async () => {
    const deps = depsFor(null, '', { captureVisibleTab: () => Promise.reject(new Error('denied')) });
    const result = await captureTab(tab('https://locked.example/', 'Locked'), SETTINGS, deps);
    expect(result.restricted).toBe(true);
    expect(result.restrictedReason).toBeTruthy();
    expect(result.values.url).toEqual({ kind: 'url', value: 'https://locked.example/' });
  });

  it('warns when the screenshot fails but the probe works', async () => {
    const url = 'https://www.acme.example/widgets';
    const deps = depsFor(FIXTURES.rich, url, { captureVisibleTab: () => Promise.reject(new Error('denied')) });
    const result = await captureTab(tab(url), SETTINGS, deps);
    expect(result.restricted).toBe(false);
    expect(result.values.screenshot).toBeUndefined();
    expect(result.values.ogImage).toBeDefined();
    expect(result.warnings).toEqual(["Couldn't take a screenshot of this page. Everything else was captured."]);
  });

  it('surfaces compression errors and reduced-size notes as warnings', async () => {
    const url = 'https://www.acme.example/widgets';
    const tooBig = depsFor(FIXTURES.rich, url, {
      compress: () => Promise.resolve(err('upload-too-large', 'Too large to upload.')),
    });
    const r1 = await captureTab(tab(url), SETTINGS, tooBig);
    expect(r1.values.screenshot).toBeUndefined();
    expect(r1.warnings).toEqual(['Too large to upload.']);

    const shrunk = depsFor(FIXTURES.rich, url, {
      compress: (d) => Promise.resolve(ok({ blob: new Blob(['x']), dataUrl: d, width: 900, height: 500, bytes: 9, reducedToFit: true })),
    });
    const r2 = await captureTab(tab(url), SETTINGS, shrunk);
    expect(r2.warnings[0]).toMatch(/shrunk/);
  });

  it('times out a hanging script and still returns', async () => {
    const deps = depsFor(FIXTURES.rich, 'https://hang.example/', {
      executeScript: () => new Promise(() => undefined),
      scriptTimeoutMs: 20,
    });
    const result = await captureTab(tab('https://hang.example/'), SETTINGS, deps);
    expect(result.restricted).toBe(false);
    expect(result.values.screenshot).toBeDefined();
  });

  it('ignores malformed probe results', async () => {
    const deps = depsFor(FIXTURES.rich, 'https://odd.example/', {
      executeScript: (() => Promise.resolve({ nope: true })) as unknown as CaptureDeps['executeScript'],
    });
    const result = await captureTab(tab('https://odd.example/', 'Odd'), SETTINGS, deps);
    expect(result.title).toBe('Odd');
    expect(result.warnings.join(' ')).toMatch(/Couldn't read/);
  });

  it('never throws, even if deps misbehave', async () => {
    const deps = depsFor(FIXTURES.rich, 'https://x.example/', {
      now: () => {
        throw new Error('clock');
      },
      captureVisibleTab: () => {
        throw new Error('sync throw');
      },
    });
    await expect(captureTab(tab('https://x.example/'), SETTINGS, deps)).resolves.toMatchObject({ restricted: false });
    await expect(captureTab({ url: 'https://x.example/' }, SETTINGS, deps)).resolves.toMatchObject({ restricted: true, tabId: -1 });
  });
});
