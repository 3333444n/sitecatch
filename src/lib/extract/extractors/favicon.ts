import type { ImageValue, RawPageData } from '../types';
import { parseUrl, toHttpUrl } from '../util';
import { defineExtractor } from './define';

type ProbedLink = RawPageData['links'][number];

interface Candidate {
  url: string;
  size: number;
  score: number;
  mimeType?: string;
}

const ICON_RELS = new Set(['icon', 'shortcut icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']);

/** Largest dimension declared in `sizes` ("16x16 32x32" → 32, "any" → 512). */
function declaredSize(sizes: string | undefined): number | undefined {
  if (sizes === undefined) return undefined;
  let best: number | undefined;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') return 512;
    const m = /^(\d+)x(\d+)$/.exec(token);
    if (m) {
      const n = Math.max(Number(m[1]), Number(m[2]));
      best = best === undefined ? n : Math.max(best, n);
    }
  }
  return best;
}

/** Size hint from the file name, e.g. "favicon-32x32.png" or "icon-192.png". */
function sizeFromHref(href: string): number | undefined {
  const m = /(?:^|[^\d])(\d{2,4})x(\d{2,4})(?:[^\d]|$)/.exec(href) ?? /[-_](\d{2,4})\.(?:png|jpe?g|webp)(?:$|[?#])/i.exec(href);
  if (!m) return undefined;
  const nums = m.slice(1).map(Number);
  return Math.max(...nums);
}

function mimeOf(link: ProbedLink, url: string): string | undefined {
  if (link.type?.startsWith('image/')) return link.type;
  const path = (parseUrl(url)?.pathname ?? '').toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.ico')) return 'image/x-icon';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return undefined;
}

function candidateOf(link: ProbedLink, base: string): Candidate | null {
  if (!ICON_RELS.has(link.rel)) return null;
  const url = toHttpUrl(link.href, base); // drops data:, blob:, etc.
  if (url === null) return null;
  const isApple = link.rel.startsWith('apple-touch-icon');
  const mimeType = mimeOf(link, url);
  const size =
    declaredSize(link.sizes) ??
    sizeFromHref(url) ??
    (isApple ? 180 : mimeType === 'image/svg+xml' ? 256 : mimeType === 'image/x-icon' ? 16 : 32);
  // Prefer raster formats Notion renders everywhere; SVG/ICO rank slightly lower at equal size.
  const formatBonus = mimeType === 'image/png' ? 2 : mimeType === 'image/x-icon' ? 0 : 1;
  const candidate: Candidate = { url, size, score: size * 10 + formatBonus };
  if (mimeType !== undefined) candidate.mimeType = mimeType;
  return candidate;
}

/** Picks the best icon URL for the page, falling back to `/favicon.ico` at the origin. */
export function pickFavicon(raw: RawPageData): ImageValue | null {
  const candidates = raw.links
    .map((link) => candidateOf(link, raw.url))
    .filter((c): c is Candidate => c !== null);

  let best: Candidate | undefined;
  for (const c of candidates) {
    if (best === undefined || c.score > best.score) best = c;
  }
  if (best !== undefined) {
    const value: ImageValue = { kind: 'image', url: best.url, width: best.size, height: best.size };
    if (best.mimeType !== undefined) value.mimeType = best.mimeType;
    return value;
  }

  const page = parseUrl(raw.url);
  if (page === null || (page.protocol !== 'http:' && page.protocol !== 'https:')) return null;
  return { kind: 'image', url: `${page.origin}/favicon.ico`, mimeType: 'image/x-icon' };
}

export const favicon = defineExtractor({
  id: 'favicon',
  label: 'Favicon',
  description: "The site's icon (largest one available). Can also be used as the page icon.",
  output: 'image',
  extract: (raw) => pickFavicon(raw),
});
