/**
 * Extractor registry.
 *
 * Adding an extractor (e.g. tech detection in v2):
 *   1. add its id to `ExtractorId` in `types.ts` (contract — via the orchestrator),
 *   2. create `extractors/<id>.ts` exporting a `defineExtractor({...})`,
 *   3. add it to `EXTRACTORS` below (the `Record<ExtractorId, …>` type makes a
 *      missing entry a compile error). Order of the record = UI order.
 */
import { canonicalUrl } from './extractors/canonicalUrl';
import { dateSaved } from './extractors/dateSaved';
import { domain } from './extractors/domain';
import { favicon } from './extractors/favicon';
import { fonts } from './extractors/fonts';
import { metaDescription } from './extractors/metaDescription';
import { ogDescription } from './extractors/ogDescription';
import { ogImage } from './extractors/ogImage';
import { ogTitle } from './extractors/ogTitle';
import { screenshot } from './extractors/screenshot';
import { selection } from './extractors/selection';
import { title } from './extractors/title';
import { url } from './extractors/url';
import type { ExtractContext, ExtractedValue, ExtractorDef, ExtractorId, RawPageData } from './types';

const EXTRACTORS: Readonly<Record<ExtractorId, ExtractorDef>> = {
  screenshot,
  title,
  ogTitle,
  url,
  canonicalUrl,
  domain,
  metaDescription,
  ogDescription,
  favicon,
  ogImage,
  selection,
  fonts,
  dateSaved,
};

/** Extractors that only need the `ExtractContext`, not page data. */
const CONTEXT_ONLY: ReadonlySet<ExtractorId> = new Set<ExtractorId>(['screenshot', 'dateSaved']);

/** Empty page data used when no probe result is available. */
const EMPTY_RAW: RawPageData = {
  title: '',
  url: '',
  meta: {},
  links: [],
  selection: '',
  fonts: { body: '' },
  readyState: 'loading',
};

export function getExtractor(id: ExtractorId): ExtractorDef | undefined {
  return (EXTRACTORS as Partial<Record<string, ExtractorDef>>)[id];
}

/** All extractors in UI order. */
export function listExtractors(): ExtractorDef[] {
  return Object.values(EXTRACTORS);
}

export interface RunExtractorsOptions {
  /** Run only these extractors (default: all). */
  only?: readonly ExtractorId[];
}

export interface ExtractorRunResult {
  values: Partial<Record<ExtractorId, ExtractedValue>>;
  /** User-facing notes for extractors that failed unexpectedly. */
  warnings: string[];
}

/**
 * Runs every (selected) extractor. Never throws: an extractor that throws is
 * skipped and reported as a warning. With `raw === null` (page couldn't be
 * probed) only context-only extractors (screenshot, dateSaved) run.
 */
export function runExtractors(
  raw: RawPageData | null,
  ctx: ExtractContext,
  options: RunExtractorsOptions = {},
): ExtractorRunResult {
  const values: Partial<Record<ExtractorId, ExtractedValue>> = {};
  const warnings: string[] = [];
  const only = options.only ? new Set(options.only) : null;

  for (const def of listExtractors()) {
    if (only !== null && !only.has(def.id)) continue;
    if (raw === null && !CONTEXT_ONLY.has(def.id)) continue;
    try {
      const value = def.extract(raw ?? EMPTY_RAW, ctx);
      if (value !== null) values[def.id] = value;
    } catch (thrown) {
      const detail = thrown instanceof Error ? thrown.message : String(thrown);
      warnings.push(`Couldn't read "${def.label}" from this page (${detail}).`);
    }
  }
  return { values, warnings };
}
