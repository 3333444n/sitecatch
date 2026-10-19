/**
 * Compatibility matrix: which extractors may feed which Notion property types,
 * and which property types accept "ask" / "static" values.
 *
 * Defined locally (keyed by ExtractorId → ValueKind) so presets don't depend on
 * the extractor registry. Keep in sync with `ExtractorDef.output` in
 * src/lib/extract/ — a test there should assert the two agree.
 */
import type { ExtractorId, ValueKind } from '@/lib/extract/types';
import type { NotionPropertyType, WritablePropertyType } from '@/lib/notion/types';
import { WRITABLE_PROPERTY_TYPES } from '@/lib/notion/types';
import type { FormValueKind } from './types';

/** Output kind of every extractor. */
export const EXTRACTOR_OUTPUT: Readonly<Record<ExtractorId, ValueKind>> = {
  screenshot: 'image',
  favicon: 'image',
  ogImage: 'image',
  title: 'text',
  ogTitle: 'text',
  metaDescription: 'text',
  ogDescription: 'text',
  selection: 'text',
  domain: 'text',
  url: 'url',
  canonicalUrl: 'url',
  fonts: 'list',
  dateSaved: 'date',
};

/** Property types each value kind may be written into. */
export const VALUE_KIND_TARGETS: Readonly<Record<ValueKind, readonly WritablePropertyType[]>> = {
  text: ['title', 'rich_text', 'select', 'multi_select'],
  url: ['url', 'rich_text', 'title'],
  list: ['multi_select', 'rich_text'],
  date: ['date'],
  image: ['files'],
};

export const EXTRACTOR_IDS = Object.keys(EXTRACTOR_OUTPUT) as ExtractorId[];

export function isWritableType(type: NotionPropertyType): type is WritablePropertyType {
  return (WRITABLE_PROPERTY_TYPES as readonly string[]).includes(type);
}

export function isCompatible(extractorId: ExtractorId, propertyType: NotionPropertyType): boolean {
  if (!isWritableType(propertyType)) return false;
  return VALUE_KIND_TARGETS[EXTRACTOR_OUTPUT[extractorId]].includes(propertyType);
}

/** Extractors that may be mapped to a property of this type (registry order). */
export function compatibleExtractors(propertyType: NotionPropertyType): ExtractorId[] {
  return EXTRACTOR_IDS.filter((id) => isCompatible(id, propertyType));
}

/**
 * Whether the popup can ask the user for a value of this type.
 * `files` is excluded: the popup has no file picker in v0 (the screenshot is
 * attached via `preset.screenshot.filesPropertyId` instead).
 */
export function supportsAsk(propertyType: NotionPropertyType): boolean {
  return isWritableType(propertyType) && propertyType !== 'files';
}

/** Whether a fixed value can be configured for this type (any writable type). */
export function supportsStatic(propertyType: NotionPropertyType): boolean {
  return isWritableType(propertyType);
}

/** Form input kind used for a property type (see FormValue docs in types.ts). */
export function formValueKindFor(propertyType: WritablePropertyType): FormValueKind {
  switch (propertyType) {
    case 'title':
    case 'rich_text':
    case 'url':
    case 'email':
    case 'phone_number':
      return 'text';
    case 'number':
      return 'number';
    case 'checkbox':
      return 'checkbox';
    case 'select':
    case 'status':
      return 'select';
    case 'multi_select':
      return 'multi_select';
    case 'date':
      return 'date';
    case 'files':
      return 'files';
  }
}
