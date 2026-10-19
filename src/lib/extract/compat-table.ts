/**
 * Single source of the extractor → Notion property compatibility table.
 * Pure data, no browser/DOM deps: used by the extractor definitions
 * (`ExtractorDef.compatible`) and by the preset editor (src/lib/presets/compat.ts).
 *
 * favicon / ogImage can additionally become the page icon / cover — that is
 * configured on the preset, not via property mappings.
 */
import type { WritablePropertyType } from '@/lib/notion/types';
import type { ValueKind } from './types';

/** Property types each extractor output kind may be written into. */
export const VALUE_KIND_TARGETS: Readonly<Record<ValueKind, readonly WritablePropertyType[]>> = {
  text: ['title', 'rich_text', 'select', 'multi_select'],
  url: ['url', 'rich_text', 'title'],
  list: ['multi_select', 'rich_text'],
  date: ['date'],
  image: ['files'],
};
