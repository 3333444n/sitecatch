import type { ExtractorDef, ValueKind } from '../types';
import { COMPATIBLE_TYPES } from '../util';

/**
 * Builds an `ExtractorDef`, filling `compatible` from the output kind's row of
 * the compatibility matrix unless overridden.
 */
export function defineExtractor(
  def: Omit<ExtractorDef, 'compatible'> & { compatible?: ExtractorDef['compatible'] },
): ExtractorDef {
  const output: ValueKind = def.output;
  return { ...def, compatible: def.compatible ?? COMPATIBLE_TYPES[output] };
}
