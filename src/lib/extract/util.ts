/** Shared helpers for extractors (run in the extension, never injected). */
import type { RawPageData } from './types';

/** Trims and collapses all whitespace runs (incl. newlines) to single spaces. */
export function cleanText(value: string | null | undefined): string {
  if (value == null) return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** Like `cleanText` but keeps paragraph structure (max one blank line). */
export function cleanMultiline(value: string | null | undefined): string {
  if (value == null) return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** First non-empty (cleaned) meta value among `keys`, or null. */
export function firstMeta(raw: RawPageData, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = cleanText(raw.meta[key]);
    if (value !== '') return value;
  }
  return null;
}

/** Resolves `value` against `base`; returns an absolute http(s) URL or null. */
export function toHttpUrl(value: string | null | undefined, base?: string): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  try {
    const url = base === undefined ? new URL(trimmed) : new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Safely parses an absolute URL. */
export function parseUrl(value: string | null | undefined): URL | null {
  try {
    return new URL((value ?? '').trim());
  } catch {
    return null;
  }
}
