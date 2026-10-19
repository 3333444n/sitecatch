/**
 * Compatibility matrix: which extractors may feed which Notion property types,
 * and which property types accept "ask" / "static" values.
 *
 * Single source: the kind → property-types table lives in
 * src/lib/extract/compat-table.ts and each extractor's output kind comes from
 * its `ExtractorDef` in the registry (pure modules, no browser deps).
 */
import { VALUE_KIND_TARGETS } from '@/lib/extract/compat-table';
import { listExtractors } from '@/lib/extract/registry';
import type { ExtractorId, ValueKind } from '@/lib/extract/types';
import type { NotionPropertyType, WritablePropertyType } from '@/lib/notion/types';
import { WRITABLE_PROPERTY_TYPES } from '@/lib/notion/types';
import type { FormValueKind } from './types';

export { VALUE_KIND_TARGETS };

/** Output kind of every extractor (derived from the registry). */
export const EXTRACTOR_OUTPUT: Readonly<Record<ExtractorId, ValueKind>> = Object.fromEntries(
  listExtractors().map((def) => [def.id, def.output]),
) as Record<ExtractorId, ValueKind>;

/** Every extractor id, in registry (UI) order. */
export const EXTRACTOR_IDS: readonly ExtractorId[] = listExtractors().map((def) => def.id);

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
