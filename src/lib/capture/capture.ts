/**
 * Orchestrates one capture of a tab: restricted check → wait for load →
 * optional delay → probe → screenshot → compress → extractors.
 *
 * Every step degrades gracefully: failures become `warnings`, or a
 * `restricted: true` result with url/title fallback. `captureTab` never throws.
 * Browser APIs are injected via `CaptureDeps` (see `createBrowserCaptureDeps`).
 */
import { browser } from 'wxt/browser';
import type { Result } from '@/lib/errors';
import { pageProbe, WAIT_FOR_READY_MAX_MS, waitForReady } from '@/lib/extract/probe';
import { runExtractors } from '@/lib/extract/registry';
import type { CaptureResult, ExtractorId, ImageValue, RawPageData } from '@/lib/extract/types';
import type { Settings } from '@/lib/storage/items';
import { compressScreenshot, type CompressedImage, type CompressOptions } from './image';
import { type BrowserFamily, classifyUrl } from './restricted';

/** The subset of `browser.tabs.Tab` capture needs. */
export interface CaptureTab {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
}

export interface CaptureDeps {
  /** Runs a self-contained `func(...args)` in the tab's top frame and returns its (awaited) result. */
  executeScript: <A extends unknown[], R>(tabId: number, func: (...args: A) => R, args: A) => Promise<Awaited<R>>;
  /** `browser.tabs.captureVisibleTab` — returns a data: URL. */
  captureVisibleTab: (windowId: number | undefined, options: { format: 'jpeg'; quality: number }) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  /** Defaults to `compressScreenshot` with real canvas ops. */
  compress?: (dataUrl: string, options: CompressOptions) => Promise<Result<CompressedImage>>;
  /** Limits restricted-host checks to one browser's list. Default 'any'. */
  browserFamily?: BrowserFamily;
  /** Per-script-call safety timeout (ms). Default 8000. */
  scriptTimeoutMs?: number;
}

export type CaptureSettings = Pick<Settings, 'captureDelayMs' | 'jpegQuality'>;

/** Extractors that still make sense when the page couldn't be read. */
const FALLBACK_EXTRACTORS: readonly ExtractorId[] = ['title', 'url', 'domain', 'dateSaved'];

const GENERIC_RESTRICTED_REASON =
  "This page doesn't allow extensions to read it, so only the address and title can be saved.";

function fallbackRaw(url: string, title: string): RawPageData {
  return { title, url, meta: {}, links: [], selection: '', fonts: { body: '' }, readyState: 'complete' };
}

function isRawPageData(value: unknown): value is RawPageData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    typeof v.url === 'string' &&
    typeof v.meta === 'object' &&
    v.meta !== null &&
    Array.isArray(v.links) &&
    typeof v.selection === 'string' &&
    typeof v.fonts === 'object' &&
    v.fonts !== null
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms} ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
  });
}

function restrictedResult(
  tabId: number,
  now: Date,
  url: string,
  title: string,
  reason: string,
  warnings: string[] = [],
): CaptureResult {
  const { values, warnings: extractWarnings } = runExtractors(fallbackRaw(url, title), { now }, { only: FALLBACK_EXTRACTORS });
  return {
    tabId,
    capturedAt: now.toISOString(),
    url,
    title,
    restricted: true,
    restrictedReason: reason,
    values,
    warnings: [...warnings, ...extractWarnings],
  };
}

export async function captureTab(tab: CaptureTab, settings: CaptureSettings, deps: CaptureDeps): Promise<CaptureResult> {
  let now: Date;
  try {
    now = deps.now();
  } catch {
    now = new Date();
  }
  const tabId = tab.id ?? -1;
  const tabUrl = tab.url ?? '';
  const tabTitle = (tab.title ?? '').trim();

  try {
    // 1. Known-restricted pages: don't even try.
    const info = classifyUrl(tabUrl, deps.browserFamily ?? 'any');
    if (info.restricted) {
      const url = info.originalUrl ?? tabUrl;
      return restrictedResult(tabId, now, url, tabTitle, info.reason ?? GENERIC_RESTRICTED_REASON);
    }
    if (tab.id === undefined) {
      return restrictedResult(tabId, now, tabUrl, tabTitle, "Sitecatch couldn't access this tab. Reload the page and try again.");
    }

    const warnings: string[] = [];
    const timeoutMs = deps.scriptTimeoutMs ?? 8000;

    // 2. Wait for the page to finish loading (capped in-page at 5 s).
    let scriptable = true;
    try {
      await withTimeout(deps.executeScript(tab.id, waitForReady, [WAIT_FOR_READY_MAX_MS]), timeoutMs, 'waitForReady');
    } catch {
      scriptable = false;
    }

    // 3. Optional user-configured delay (lazy-loaded content, animations).
    if (settings.captureDelayMs > 0) {
      try {
        await deps.sleep(settings.captureDelayMs);
      } catch {
        // ignore
      }
    }

    // 4. Probe.
    let raw: RawPageData | null = null;
    if (scriptable) {
      try {
        const result: unknown = await withTimeout(deps.executeScript(tab.id, pageProbe, []), timeoutMs, 'pageProbe');
        if (isRawPageData(result)) raw = result;
      } catch {
        // handled below
      }
    }

    // 5. Screenshot.
    let screenshot: ImageValue | undefined;
    let screenshotError: string | null = null;
    try {
      const quality = Math.round(Math.min(1, Math.max(0, settings.jpegQuality)) * 100);
      const shot = await deps.captureVisibleTab(tab.windowId, { format: 'jpeg', quality });
      const compress = deps.compress ?? ((d: string, o: CompressOptions) => compressScreenshot(d, o));
      const compressed = await compress(shot, { quality: settings.jpegQuality });
      if (compressed.ok) {
        const c = compressed.data;
        screenshot = { kind: 'image', dataUrl: c.dataUrl, width: c.width, height: c.height, bytes: c.bytes, mimeType: 'image/jpeg' };
        if (c.reducedToFit) warnings.push("The screenshot was shrunk to fit Notion's upload limit.");
      } else {
        screenshotError = compressed.error.message;
      }
    } catch {
      screenshotError = "Couldn't take a screenshot of this page. Everything else was captured.";
    }

    if (!scriptable && raw === null && screenshot === undefined) {
      // Nothing worked: behave like a known-restricted page.
      return restrictedResult(tabId, now, tabUrl, tabTitle, GENERIC_RESTRICTED_REASON);
    }
    if (screenshotError !== null) warnings.push(screenshotError);

    let pageData: RawPageData;
    if (raw === null) {
      warnings.push("Couldn't read this page's details (description, images, fonts). The address and title were captured.");
      pageData = fallbackRaw(tabUrl, tabTitle);
    } else {
      pageData = raw;
    }

    const ctx = screenshot === undefined ? { now } : { now, screenshot };
    const extracted = raw === null
      ? runExtractors(pageData, ctx, { only: [...FALLBACK_EXTRACTORS, 'screenshot'] })
      : runExtractors(pageData, ctx);

    return {
      tabId,
      capturedAt: now.toISOString(),
      url: pageData.url || tabUrl,
      title: pageData.title.trim() || tabTitle,
      restricted: false,
      values: extracted.values,
      warnings: [...warnings, ...extracted.warnings],
    };
  } catch (thrown) {
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    return restrictedResult(tabId, now, tabUrl, tabTitle, GENERIC_RESTRICTED_REASON, [`Capture failed unexpectedly (${detail}).`]);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Real dependencies backed by WXT's `browser` (requires the `activeTab` +
 * `scripting` permissions; call from the background after a user gesture).
 */
export function createBrowserCaptureDeps(): CaptureDeps {
  return {
    async executeScript<A extends unknown[], R>(tabId: number, func: (...args: A) => R, args: A): Promise<Awaited<R>> {
      const results = await browser.scripting.executeScript({ target: { tabId }, func, args });
      const first = results[0] as { result?: unknown; error?: unknown } | undefined;
      if (first === undefined) throw new Error('No injection result');
      if (first.error !== undefined && first.error !== null) {
        throw first.error instanceof Error ? first.error : new Error(JSON.stringify(first.error));
      }
      return first.result as Awaited<R>;
    },
    captureVisibleTab: (windowId, options) =>
      windowId === undefined ? browser.tabs.captureVisibleTab(options) : browser.tabs.captureVisibleTab(windowId, options),
    sleep,
    now: () => new Date(),
    browserFamily: import.meta.env.FIREFOX ? 'firefox' : import.meta.env.CHROME || import.meta.env.EDGE ? 'chromium' : 'any',
  };
}
