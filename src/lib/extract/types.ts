/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * Extraction pipeline:
 *   1. capture probe (injected via scripting.executeScript) returns `RawPageData`
 *      — plain serializable data, no DOM nodes;
 *   2. capture module takes the screenshot (captureVisibleTab) separately;
 *   3. each registered `ExtractorDef.extract(raw, ctx)` turns that into an
 *      `ExtractedValue` (pure function → easy to unit test with fixtures);
 *   4. results are bundled into a `CaptureResult` and sent to the popup.
 */
import type { NotionPropertyType } from '@/lib/notion/types';

export type ExtractorId =
  | 'screenshot'
  | 'title'
  | 'ogTitle'
  | 'url'
  | 'canonicalUrl'
  | 'domain'
  | 'metaDescription'
  | 'ogDescription'
  | 'favicon'
  | 'ogImage'
  | 'selection'
  | 'fonts'
  | 'dateSaved';

/** Shape of value an extractor produces; drives the compatibility matrix. */
export type ValueKind = 'text' | 'url' | 'list' | 'date' | 'image';

export interface TextValue {
  kind: 'text';
  value: string;
}
export interface UrlValue {
  kind: 'url';
  /** Absolute URL. */
  value: string;
}
export interface ListValue {
  kind: 'list';
  /** e.g. font family names; maps naturally to multi_select. */
  value: string[];
}
export interface DateValue {
  kind: 'date';
  /** ISO 8601 date or date-time. */
  value: string;
}
export interface ImageValue {
  kind: 'image';
  /** Captured image (screenshot) as a data: URL (JPEG). */
  dataUrl?: string;
  /** Remote image (favicon, og:image) as an absolute URL. */
  url?: string;
  width?: number;
  height?: number;
  /** Size of the decoded bytes, for upload-limit checks. */
  bytes?: number;
  /** e.g. 'image/jpeg'. */
  mimeType?: string;
}

export type ExtractedValue = TextValue | UrlValue | ListValue | DateValue | ImageValue;

/** Raw, serializable data returned by the in-page probe. */
export interface RawPageData {
  /** document.title */
  title: string;
  /** location.href */
  url: string;
  /**
   * <meta> tags keyed by lowercased `name` or `property` (e.g. 'description',
   * 'og:title', 'og:image', 'twitter:image'). First occurrence wins.
   */
  meta: Record<string, string>;
  /**
   * <link> elements with rel + absolute href (icon, apple-touch-icon, canonical…).
   * `sizes` / `type` are lowercased and present only when the element has them.
   */
  links: { rel: string; href: string; sizes?: string; type?: string }[];
  /** window.getSelection() as text ('' when none). */
  selection: string;
  /** Computed primary font family of body / first h1 / first h2. */
  fonts: { body: string; h1?: string; h2?: string };
  /** document.readyState at probe time. */
  readyState: DocumentReadyState;
}

/** Context available to every extractor. */
export interface ExtractContext {
  /** Time of capture (inject for deterministic tests). */
  now: Date;
  /** Screenshot taken by the capture module, if any (consumed by the `screenshot` extractor). */
  screenshot?: ImageValue;
}

export interface ExtractorDef {
  id: ExtractorId;
  /** Short UI label, e.g. "Open Graph title". */
  label: string;
  /** One-line explanation shown in the preset editor. */
  description: string;
  output: ValueKind;
  /** Notion property types this extractor may be mapped to. */
  compatible: readonly NotionPropertyType[];
  /**
   * Whether the extractor reads `RawPageData`. Default true. Extractors with
   * `false` (screenshot, dateSaved) only use the `ExtractContext` and still run
   * when the page couldn't be probed.
   */
  needsPage?: boolean;
  /** Pure function. Returns null when the page has no such value. */
  extract(raw: RawPageData, ctx: ExtractContext): ExtractedValue | null;
}

/** Everything captured from one tab, sent from background to popup. */
export interface CaptureResult {
  tabId: number;
  /** ISO 8601. */
  capturedAt: string;
  url: string;
  title: string;
  /**
   * True when the page couldn't be scripted/captured. `values` then holds only
   * what's known without page access: url, title, domain and dateSaved (each
   * may be absent, e.g. when the tab has no usable URL).
   */
  restricted: boolean;
  /** User-facing reason, e.g. "Firefox doesn't allow extensions on add-on store pages." */
  restrictedReason?: string;
  values: Partial<Record<ExtractorId, ExtractedValue>>;
  /** Non-fatal, user-facing notes (e.g. "Screenshot was downscaled"). */
  warnings: string[];
}
