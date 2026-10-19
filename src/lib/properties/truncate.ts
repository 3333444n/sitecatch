/**
 * Notion request limits (https://developers.notion.com/reference/request-limits):
 * rich text `text.content` ≤ 2000 chars, rich text arrays ≤ 100 items,
 * multi_select ≤ 100 options, url ≤ 2000, email/phone ≤ 200 chars.
 * Option names can't contain commas and are ≤ 100 chars.
 */
export const RICH_TEXT_CHUNK = 2000;
export const RICH_TEXT_MAX_ITEMS = 100;
export const MULTI_SELECT_MAX = 100;
export const URL_MAX = 2000;
export const EMAIL_MAX = 200;
export const PHONE_MAX = 200;
export const OPTION_NAME_MAX = 100;
export const FILE_NAME_MAX = 100;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Cuts `text` to at most `max` UTF-16 units without splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = isHighSurrogate(text.charCodeAt(max - 1)) ? max - 1 : max;
  return text.slice(0, end);
}

/**
 * Splits text into ≤ `size`-unit chunks (never splitting surrogate pairs),
 * at most `maxChunks`. `truncated` is true when text was dropped.
 */
export function chunkText(
  text: string,
  size = RICH_TEXT_CHUNK,
  maxChunks = RICH_TEXT_MAX_ITEMS,
): { chunks: string[]; truncated: boolean } {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length && chunks.length < maxChunks) {
    let piece = text.slice(i, i + size);
    if (piece.length === size && size > 1 && isHighSurrogate(piece.charCodeAt(size - 1))) {
      piece = piece.slice(0, -1);
    }
    chunks.push(piece);
    i += piece.length;
  }
  return { chunks, truncated: i < text.length };
}

/** Select/multi_select option name: no commas, collapsed whitespace, ≤ 100 chars. */
export function sanitizeOptionName(name: string): string {
  return truncate(name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim(), OPTION_NAME_MAX).trim();
}
