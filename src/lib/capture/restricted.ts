/**
 * Classifies tab URLs that extensions cannot script or capture, so the popup
 * can fall back to URL/title only with an explanation.
 *
 * Sources:
 *  - Firefox: default of `extensions.webextensions.restrictedDomains`
 *    (modules/libpref/init/all.js in mozilla-firefox/firefox), plus privileged
 *    schemes (about:, moz-extension:, resource:, view-source:…), the built-in
 *    PDF viewer (pdf.js) and Reader View (about:reader?url=…). Users/admins may
 *    also configure `extensions.quarantinedDomains.list` — those fail at runtime
 *    and are handled by capture.ts' graceful fallback.
 *  - Chromium: Chrome Web Store (chromewebstore.google.com,
 *    chrome.google.com/webstore), Edge Add-ons (microsoftedge.microsoft.com/addons),
 *    chrome:/edge:/chrome-extension:/devtools: schemes, built-in PDF viewer.
 */

export type BrowserFamily = 'firefox' | 'chromium' | 'any';

export interface RestrictedInfo {
  restricted: boolean;
  /** User-facing explanation (present when restricted). */
  reason?: string;
  /** For wrappers like Reader View / view-source: the real page URL. */
  originalUrl?: string;
}

/** Default of Firefox's `extensions.webextensions.restrictedDomains` pref. */
export const FIREFOX_RESTRICTED_DOMAINS: readonly string[] = [
  'accounts-static.cdn.mozilla.net',
  'accounts.firefox.com',
  'addons.cdn.mozilla.net',
  'addons.mozilla.org',
  'api.accounts.firefox.com',
  'content.cdn.mozilla.net',
  'discovery.addons.mozilla.org',
  'oauth.accounts.firefox.com',
  'profile.accounts.firefox.com',
  'support.mozilla.org',
  'sync.services.mozilla.com',
];

/** Chromium-protected hosts, with an optional path prefix. */
const CHROMIUM_RESTRICTED: readonly { host: string; pathPrefix?: string }[] = [
  { host: 'chromewebstore.google.com' },
  { host: 'chrome.google.com', pathPrefix: '/webstore' },
  { host: 'microsoftedge.microsoft.com', pathPrefix: '/addons' },
];

const BROWSER_PAGE = "Browsers don't let extensions read their own built-in pages, so only the address and title can be saved.";
const EXTENSION_PAGE = "Pages of browser extensions can't be read by other extensions, so only the address and title can be saved.";

const SCHEME_REASONS: Readonly<Record<string, string>> = {
  'about:': BROWSER_PAGE,
  'chrome:': BROWSER_PAGE,
  'edge:': BROWSER_PAGE,
  'brave:': BROWSER_PAGE,
  'opera:': BROWSER_PAGE,
  'vivaldi:': BROWSER_PAGE,
  'chrome-search:': BROWSER_PAGE,
  'chrome-untrusted:': BROWSER_PAGE,
  'devtools:': BROWSER_PAGE,
  'resource:': BROWSER_PAGE,
  'moz-extension:': EXTENSION_PAGE,
  'chrome-extension:': EXTENSION_PAGE,
  'extension:': EXTENSION_PAGE,
  'data:': "Pages opened from a data: link can't be read by extensions, so only the address and title can be saved.",
  'blob:': "Pages opened from a blob: link can't be read by extensions, so only the address and title can be saved.",
  'javascript:': "This tab can't be read by extensions.",
  'file:': "Local files on your computer can't be read by Sitecatch, so only the address and title can be saved.",
};

const STORE_REASON = {
  firefox: "Firefox doesn't allow extensions on Mozilla's add-on store and account pages, so only the address and title can be saved.",
  chromium: "Your browser doesn't allow extensions on its extension store, so only the address and title can be saved.",
} as const;

const PDF_REASON = "PDFs open in the browser's built-in viewer, which extensions can't read, so only the address and title can be saved.";
const READER_REASON = "Reader View can't be read by extensions, so the original page's address and the title will be saved.";
const VIEW_SOURCE_REASON = "Source view can't be read by extensions, so the original page's address and the title will be saved.";
const NO_URL_REASON = "Sitecatch can't see this tab's address. Reload the page and try again.";

const NOT_RESTRICTED: RestrictedInfo = { restricted: false };

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `about:reader?url=<encoded>` → original URL. */
function readerOriginal(raw: string): string | undefined {
  const query = raw.slice(raw.indexOf('?') + 1);
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === 'url') {
      const decoded = decodeParam(part.slice(eq + 1));
      return decoded === '' ? undefined : decoded;
    }
  }
  return undefined;
}

function isPdfPath(url: URL): boolean {
  return /\.pdf$/i.test(decodeParam(url.pathname));
}

/**
 * Returns whether Sitecatch can script/capture `rawUrl`. `browser` limits the
 * host checks to that browser's protected domains (default: both).
 */
export function classifyUrl(rawUrl: string | undefined | null, browser: BrowserFamily = 'any'): RestrictedInfo {
  const input = (rawUrl ?? '').trim();
  if (input === '') return { restricted: true, reason: NO_URL_REASON };

  const lower = input.toLowerCase();
  if (lower.startsWith('about:reader')) {
    const originalUrl = readerOriginal(input);
    return originalUrl === undefined
      ? { restricted: true, reason: READER_REASON }
      : { restricted: true, reason: READER_REASON, originalUrl };
  }
  if (lower.startsWith('view-source:')) {
    const originalUrl = input.slice('view-source:'.length).trim();
    return originalUrl === ''
      ? { restricted: true, reason: VIEW_SOURCE_REASON }
      : { restricted: true, reason: VIEW_SOURCE_REASON, originalUrl };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { restricted: true, reason: NO_URL_REASON };
  }

  const schemeReason = SCHEME_REASONS[url.protocol];
  if (schemeReason !== undefined) {
    if (url.protocol === 'file:' && isPdfPath(url)) return { restricted: true, reason: PDF_REASON };
    return { restricted: true, reason: schemeReason };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { restricted: true, reason: "This kind of page can't be read by extensions, so only the address and title can be saved." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (browser !== 'chromium' && FIREFOX_RESTRICTED_DOMAINS.includes(host)) {
    return { restricted: true, reason: STORE_REASON.firefox };
  }
  if (browser !== 'firefox') {
    const path = url.pathname.toLowerCase();
    const hit = CHROMIUM_RESTRICTED.some(
      (r) => r.host === host && (r.pathPrefix === undefined || path === r.pathPrefix || path.startsWith(`${r.pathPrefix}/`)),
    );
    if (hit) return { restricted: true, reason: STORE_REASON.chromium };
  }

  if (isPdfPath(url)) return { restricted: true, reason: PDF_REASON };

  return NOT_RESTRICTED;
}
