/**
 * URL normalization for duplicate detection. Two URLs that normalize to the
 * same string are considered the same page.
 */

/** Query parameters dropped as tracking noise (exact names, lowercase). */
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'igshid',
  'si',
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
}

/**
 * - lowercases the host (keeps `www.` — it can be a different site),
 * - drops the fragment and default ports,
 * - drops tracking params (utm_*, fbclid, gclid, mc_cid, mc_eid, ref, ref_src, igshid, si),
 * - sorts the remaining params by name (stable),
 * - strips a trailing slash from the path, except for the root.
 * Unparseable input is returned trimmed and otherwise unchanged.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  url.search = kept.length === 0 ? '' : new URLSearchParams(kept).toString();

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }
  return url.href;
}

/** `[normalized, raw]` without duplicates — for OR-queries against stored URLs. */
export function urlVariants(input: string): string[] {
  const raw = input.trim();
  const normalized = normalizeUrl(raw);
  return normalized === raw ? [normalized] : [normalized, raw];
}
