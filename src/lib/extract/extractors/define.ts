import type { ExtractorDef, ValueKind } from '../types';
import { VALUE_KIND_TARGETS } from '../compat-table';

/**
 * Builds an `ExtractorDef`, filling `compatible` from the output kind's row of
 * the compatibility table (compat-table.ts) unless overridden.
 */
export function defineExtractor(
  def: Omit<ExtractorDef, 'compatible'> & { compatible?: ExtractorDef['compatible'] },
): ExtractorDef {
  const output: ValueKind = def.output;
  return { ...def, compatible: def.compatible ?? VALUE_KIND_TARGETS[output] };
}
