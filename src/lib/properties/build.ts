/**
 * Turns form values into Notion API JSON for POST/PATCH /v1/pages.
 *
 * Shapes follow https://developers.notion.com/reference/page-property-values
 * and https://developers.notion.com/docs/uploading-small-files (Notion-Version
 * 2026-03-11). Properties are keyed by property id, which the API accepts in
 * place of the name.
 */
import type { CaptureResult } from '@/lib/extract/types';
import type { DataSourceSchema, PropertySchema } from '@/lib/notion/types';
import { isWritableType } from '@/lib/presets/compat';
import { fileNameFromUrl } from '@/lib/presets/resolve';
import type { FileRef, FormValue, FormValues, Preset } from '@/lib/presets/types';
import { isEmptyFormValue } from '@/lib/presets/values';
import {
  chunkText,
  EMAIL_MAX,
  FILE_NAME_MAX,
  MULTI_SELECT_MAX,
  PHONE_MAX,
  sanitizeOptionName,
  truncate,
  URL_MAX,
} from './truncate';

export interface NotionRichTextItem {
  type: 'text';
  text: { content: string };
}

export type NotionFileValue =
  | { type: 'file_upload'; file_upload: { id: string }; name: string }
  | { type: 'external'; name: string; external: { url: string } };

export interface NotionDateValue {
  start: string;
  end?: string;
}

/** Request JSON for one property value. */
export type NotionPropertyValue =
  | { title: NotionRichTextItem[] }
  | { rich_text: NotionRichTextItem[] }
  | { number: number }
  | { checkbox: boolean }
  | { select: { name: string } }
  | { multi_select: { name: string }[] }
  | { status: { name: string } }
  | { date: NotionDateValue }
  | { files: NotionFileValue[] }
  | { url: string }
  | { email: string }
  | { phone_number: string };

export type NotionFileObject =
  | { type: 'external'; external: { url: string } }
  | { type: 'file_upload'; file_upload: { id: string } };

export interface NotionImageBlock {
  object: 'block';
  type: 'image';
  image: { type: 'file_upload'; file_upload: { id: string } };
}

export interface PageExtras {
  icon?: { type: 'external'; external: { url: string } };
  cover?: NotionFileObject;
  children?: NotionImageBlock[];
}

export interface BuildContext {
  /** Id of the completed file upload holding the screenshot, if any. */
  screenshotUploadId?: string;
  /** File name used for the screenshot in `files` properties. */
  screenshotName?: string;
}

export interface BuildResult {
  properties: Record<string, NotionPropertyValue>;
  /** User-facing notes about values that were shortened or dropped. */
  warnings: string[];
}

export const DEFAULT_SCREENSHOT_NAME = 'screenshot.jpg';

function richText(text: string, prop: PropertySchema, warnings: string[]): NotionRichTextItem[] {
  const { chunks, truncated } = chunkText(text);
  if (truncated) warnings.push(`“${prop.name}” was too long for Notion and was shortened.`);
  return chunks.map((content) => ({ type: 'text', text: { content } }));
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function fileValues(
  refs: FileRef[],
  prop: PropertySchema,
  ctx: BuildContext,
  warnings: string[],
): NotionFileValue[] {
  const out: NotionFileValue[] = [];
  let screenshotAdded = false;
  for (const ref of refs) {
    if (ref.kind === 'screenshot') {
      if (screenshotAdded) continue;
      if (!ctx.screenshotUploadId) {
        warnings.push(`The screenshot isn't available, so it wasn't attached to “${prop.name}”.`);
        continue;
      }
      out.push({
        type: 'file_upload',
        file_upload: { id: ctx.screenshotUploadId },
        name: truncate(ctx.screenshotName ?? DEFAULT_SCREENSHOT_NAME, FILE_NAME_MAX),
      });
      screenshotAdded = true;
    } else {
      const url = ref.url.trim();
      if (!isHttpUrl(url) || url.length > URL_MAX) {
        warnings.push(`A file link in “${prop.name}” isn't a valid web address and was skipped.`);
        continue;
      }
      const name = truncate(ref.name?.trim() || fileNameFromUrl(url, 'file'), FILE_NAME_MAX);
      out.push({ type: 'external', name, external: { url } });
    }
  }
  return out;
}

/** Builds one property value, or null when there is nothing (valid) to write. */
function buildValue(
  value: FormValue,
  prop: PropertySchema,
  ctx: BuildContext,
  warnings: string[],
): NotionPropertyValue | null {
  if (isEmptyFormValue(value)) return null;
  const mismatch = () => {
    warnings.push(`“${prop.name}” has an unexpected kind of value and was skipped. Check the preset.`);
    return null;
  };
  switch (prop.type) {
    case 'title':
    case 'rich_text': {
      if (value.kind !== 'text') return mismatch();
      const items = richText(value.value, prop, warnings);
      return prop.type === 'title' ? { title: items } : { rich_text: items };
    }
    case 'url': {
      if (value.kind !== 'text') return mismatch();
      const url = value.value.trim();
      if (url.length > URL_MAX) {
        warnings.push(`The link for “${prop.name}” is longer than Notion allows (2000 characters) and was left empty.`);
        return null;
      }
      if (!URL.canParse(url)) {
        warnings.push(`“${url}” isn't a valid link, so “${prop.name}” was left empty.`);
        return null;
      }
      return { url };
    }
    case 'email':
    case 'phone_number': {
      if (value.kind !== 'text') return mismatch();
      const text = value.value.trim();
      const max = prop.type === 'email' ? EMAIL_MAX : PHONE_MAX;
      if (text.length > max) {
        warnings.push(`“${prop.name}” is longer than Notion allows (${max} characters) and was left empty.`);
        return null;
      }
      return prop.type === 'email' ? { email: text } : { phone_number: text };
    }
    case 'number':
      if (value.kind !== 'number' || value.value === null) return mismatch();
      return { number: value.value };
    case 'checkbox':
      if (value.kind !== 'checkbox') return mismatch();
      return { checkbox: value.value };
    case 'select': {
      if (value.kind !== 'select' || value.value === null) return mismatch();
      const name = sanitizeOptionName(value.value);
      return name ? { select: { name } } : null;
    }
    case 'status': {
      if (value.kind !== 'select' || value.value === null) return mismatch();
      const name = value.value.trim();
      return name ? { status: { name } } : null;
    }
    case 'multi_select': {
      if (value.kind !== 'multi_select') return mismatch();
      const names = [...new Set(value.value.map(sanitizeOptionName).filter(Boolean))];
      if (names.length > MULTI_SELECT_MAX) {
        warnings.push(`“${prop.name}” had more than ${MULTI_SELECT_MAX} options; only the first ${MULTI_SELECT_MAX} were saved.`);
      }
      const limited = names.slice(0, MULTI_SELECT_MAX);
      return limited.length > 0 ? { multi_select: limited.map((name) => ({ name })) } : null;
    }
    case 'date': {
      if (value.kind !== 'date' || value.value === null) return mismatch();
      const start = value.value.start.trim();
      const end = value.value.end?.trim();
      return { date: end ? { start, end } : { start } };
    }
    case 'files': {
      if (value.kind !== 'files') return mismatch();
      const files = fileValues(value.value, prop, ctx, warnings);
      return files.length > 0 ? { files } : null;
    }
    default:
      return null;
  }
}

export function buildProperties(
  preset: Preset,
  values: FormValues,
  schema: DataSourceSchema,
  ctx: BuildContext = {},
): BuildResult {
  const properties: Record<string, NotionPropertyValue> = {};
  const warnings: string[] = [];

  for (const mapping of preset.mappings) {
    const prop = schema.properties[mapping.propertyId];
    if (!prop) {
      warnings.push(`“${mapping.propertyName}” no longer exists in the database and was skipped.`);
      continue;
    }
    if (!isWritableType(prop.type)) {
      warnings.push(`“${prop.name}” is a ${prop.type} property, which Sitecatch can't write to. It was skipped.`);
      continue;
    }
    const value = values[mapping.propertyId];
    if (!value) continue;
    const built = buildValue(value, prop, ctx, warnings);
    if (built) properties[prop.id] = built;
  }

  // Attach the screenshot to the preset's screenshot files property.
  const filesId = preset.screenshot.filesPropertyId;
  const filesProp = filesId === null ? undefined : schema.properties[filesId];
  if (filesProp?.type === 'files' && ctx.screenshotUploadId) {
    const existing = properties[filesProp.id];
    const current = existing && 'files' in existing ? existing.files : [];
    const already = current.some(
      (f) => f.type === 'file_upload' && f.file_upload.id === ctx.screenshotUploadId,
    );
    if (!already) {
      properties[filesProp.id] = {
        files: [
          ...current,
          {
            type: 'file_upload',
            file_upload: { id: ctx.screenshotUploadId },
            name: truncate(ctx.screenshotName ?? DEFAULT_SCREENSHOT_NAME, FILE_NAME_MAX),
          },
        ],
      };
    }
  }

  return { properties, warnings };
}

/** Page icon, cover and body blocks for the preset. */
export function buildPageExtras(preset: Preset, capture: CaptureResult, uploadId?: string): PageExtras {
  const extras: PageExtras = {};

  if (preset.icon === 'favicon') {
    const fav = capture.values.favicon;
    const url = fav?.kind === 'image' ? fav.url : undefined;
    if (url && isHttpUrl(url) && url.length <= URL_MAX) {
      extras.icon = { type: 'external', external: { url } };
    }
  }

  if (preset.cover === 'screenshot' && uploadId) {
    extras.cover = { type: 'file_upload', file_upload: { id: uploadId } };
  } else if (preset.cover === 'ogImage') {
    const og = capture.values.ogImage;
    const url = og?.kind === 'image' ? og.url : undefined;
    if (url && isHttpUrl(url) && url.length <= URL_MAX) {
      extras.cover = { type: 'external', external: { url } };
    }
  }

  if (preset.screenshot.bodyImage && uploadId) {
    extras.children = [
      { object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: uploadId } } },
    ];
  }

  return extras;
}
