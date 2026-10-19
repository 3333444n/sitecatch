/**
 * In-page functions injected with `browser.scripting.executeScript({ func })`.
 *
 * IMPORTANT: these functions are serialized with `Function.prototype.toString()`
 * and evaluated inside the page. They must be **fully self-contained**:
 *   - no imports, no references to module-level constants or helpers,
 *   - no closures over outer variables,
 *   - only standard DOM / JS globals (document, location, window, URL…).
 * `probe.test.ts` enforces this by re-creating them from their source text.
 */
import type { RawPageData } from './types';

/** Max characters of selected text returned by the probe. */
export const SELECTION_MAX_CHARS = 10_000;

/** Upper bound for `waitForReady`, whatever the caller asks for. */
export const WAIT_FOR_READY_MAX_MS = 5_000;

/**
 * Collects serializable page data. Self-contained (see file header).
 *
 * Links additionally carry `sizes` / `type` when present (extra fields beyond
 * the `RawPageData` contract, used by the favicon extractor when available).
 */
export function pageProbe(): RawPageData {
  const SELECTION_LIMIT = 10000;
  const LINK_RELS = ['icon', 'shortcut icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'canonical', 'mask-icon'];

  const toAbsolute = (value: string | null): string | null => {
    if (value === null) return null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    try {
      return new URL(trimmed, document.baseURI || location.href).href;
    } catch {
      return null;
    }
  };

  const meta: Record<string, string> = {};
  const metas = document.querySelectorAll('meta');
  for (let i = 0; i < metas.length; i++) {
    const el = metas[i];
    if (!el) continue;
    const content = el.getAttribute('content');
    if (content === null) continue;
    const keys = [el.getAttribute('property'), el.getAttribute('name'), el.getAttribute('itemprop')];
    for (let k = 0; k < keys.length; k++) {
      const key = (keys[k] ?? '').trim().toLowerCase();
      if (key !== '' && !Object.prototype.hasOwnProperty.call(meta, key)) {
        meta[key] = content.trim();
      }
    }
  }

  const links: { rel: string; href: string; sizes?: string; type?: string }[] = [];
  const linkEls = document.querySelectorAll('link[rel][href]');
  for (let i = 0; i < linkEls.length; i++) {
    const el = linkEls[i];
    if (!el) continue;
    const rel = (el.getAttribute('rel') ?? '').trim().toLowerCase().split(/\s+/).join(' ');
    if (LINK_RELS.indexOf(rel) === -1) continue;
    const href = toAbsolute(el.getAttribute('href'));
    if (href === null) continue;
    const entry: { rel: string; href: string; sizes?: string; type?: string } = { rel, href };
    const sizes = el.getAttribute('sizes');
    if (sizes !== null && sizes.trim() !== '') entry.sizes = sizes.trim().toLowerCase();
    const type = el.getAttribute('type');
    if (type !== null && type.trim() !== '') entry.type = type.trim().toLowerCase();
    links.push(entry);
  }

  let selection: string;
  try {
    const sel = window.getSelection();
    selection = sel ? sel.toString() : '';
  } catch {
    selection = '';
  }
  if (selection.length > SELECTION_LIMIT) selection = selection.slice(0, SELECTION_LIMIT);

  const fontOf = (el: Element | null): string | undefined => {
    if (!el) return undefined;
    try {
      const family = window.getComputedStyle(el).fontFamily;
      return family ? family : undefined;
    } catch {
      return undefined;
    }
  };

  const fonts: RawPageData['fonts'] = { body: fontOf(document.body) ?? '' };
  const h1 = fontOf(document.querySelector('h1'));
  if (h1 !== undefined) fonts.h1 = h1;
  const h2 = fontOf(document.querySelector('h2'));
  if (h2 !== undefined) fonts.h2 = h2;

  return {
    title: document.title || '',
    url: location.href,
    meta,
    links,
    selection,
    fonts,
    readyState: document.readyState,
  };
}

/**
 * Resolves once `document.readyState === 'complete'` or after `timeoutMs`
 * (capped at 5 s), whichever comes first. Resolves with the readyState at that
 * moment; never rejects. Self-contained (see file header).
 */
export function waitForReady(timeoutMs: number): Promise<DocumentReadyState> {
  const MAX = 5000;
  const requested = typeof timeoutMs === 'number' && isFinite(timeoutMs) ? timeoutMs : MAX;
  const limit = Math.min(Math.max(requested, 0), MAX);

  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve('complete');
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('load', onLoad);
      document.removeEventListener('readystatechange', onChange);
      resolve(document.readyState);
    };
    const onLoad = (): void => {
      finish();
    };
    const onChange = (): void => {
      if (document.readyState === 'complete') finish();
    };
    window.addEventListener('load', onLoad);
    document.addEventListener('readystatechange', onChange);
    const timer = setTimeout(finish, limit);
  });
}
