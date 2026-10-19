/**
 * Validates a preset against the live data source schema. Mappings target
 * properties by id, so renames are harmless (info only), while deleted
 * properties and type changes block saving until the preset is fixed.
 */
import type { DataSourceSchema, PropertySchema } from '@/lib/notion/types';
import { isCompatible, isWritableType } from './compat';
import type { FormValue, Mapping, Preset, PresetIssue } from './types';

/**
 * `PresetIssue` plus whether it blocks saving. Structurally a `PresetIssue`,
 * so it can be passed anywhere one is expected.
 */
export interface ValidationIssue extends PresetIssue {
  blocking: boolean;
}

/** Property types usable for duplicate detection. */
export const DEDUPE_PROPERTY_TYPES = ['url', 'rich_text', 'title'] as const;

/**
 * Whether the issue must be fixed before saving. Uses the `blocking` flag set
 * by `validatePreset`; for bare `PresetIssue`s falls back to the kind
 * (option-missing then counts as non-blocking since select options are auto-created).
 */
export function isBlocking(issue: PresetIssue): boolean {
  const flag = (issue as Partial<ValidationIssue>).blocking;
  if (typeof flag === 'boolean') return flag;
  return issue.kind === 'missing' || issue.kind === 'type-changed';
}

function optionNames(value: FormValue | undefined): string[] {
  if (!value) return [];
  if (value.kind === 'select') return value.value ? [value.value] : [];
  if (value.kind === 'multi_select') return value.value;
  return [];
}

function configuredValue(mapping: Mapping): FormValue | undefined {
  if (mapping.source.kind === 'static') return mapping.source.value;
  if (mapping.source.kind === 'ask') return mapping.source.default;
  return undefined;
}

function validateMapping(mapping: Mapping, prop: PropertySchema | undefined): ValidationIssue[] {
  const label = `“${mapping.propertyName}”`;
  if (!prop) {
    return [
      {
        propertyId: mapping.propertyId,
        kind: 'missing',
        blocking: true,
        detail: `The property ${label} was deleted from the database or is no longer shared. Remove it from the preset or pick another property.`,
      },
    ];
  }
  const issues: ValidationIssue[] = [];
  if (prop.name !== mapping.propertyName) {
    issues.push({
      propertyId: mapping.propertyId,
      kind: 'renamed',
      blocking: false,
      detail: `${label} was renamed to “${prop.name}” in Notion. The mapping still works; save the preset to update the name.`,
    });
  }
  const typeOk =
    prop.type === mapping.propertyType &&
    isWritableType(prop.type) &&
    (mapping.source.kind !== 'extractor' || isCompatible(mapping.source.extractor, prop.type));
  if (!typeOk) {
    issues.push({
      propertyId: mapping.propertyId,
      kind: 'type-changed',
      blocking: true,
      detail: isWritableType(prop.type)
        ? `“${prop.name}” changed type from ${mapping.propertyType} to ${prop.type}. Edit the preset to choose a new value for it.`
        : `“${prop.name}” is now a ${prop.type} property, which Sitecatch can't write to. Remove it from the preset.`,
    });
    return issues;
  }
  if (prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status') {
    const existing = new Set((prop.options ?? []).map((o) => o.name));
    const missing = optionNames(configuredValue(mapping)).filter((n) => n !== '' && !existing.has(n));
    for (const name of missing) {
      const status = prop.type === 'status';
      issues.push({
        propertyId: mapping.propertyId,
        kind: 'option-missing',
        blocking: status,
        detail: status
          ? `The status “${name}” no longer exists in “${prop.name}”. Notion can't create status options through the API — pick an existing status in the preset.`
          : `The option “${name}” no longer exists in “${prop.name}”. It will be created again on save.`,
      });
    }
  }
  return issues;
}

export function validatePreset(preset: Preset, schema: DataSourceSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = preset.mappings.flatMap((m) =>
    validateMapping(m, schema.properties[m.propertyId]),
  );

  const filesId = preset.screenshot.filesPropertyId;
  if (filesId !== null) {
    const prop = schema.properties[filesId];
    if (!prop) {
      issues.push({
        propertyId: filesId,
        kind: 'missing',
        blocking: true,
        detail:
          'The files property for the screenshot was deleted or is no longer shared. Choose another files property or turn off attaching the screenshot.',
      });
    } else if (prop.type !== 'files') {
      issues.push({
        propertyId: filesId,
        kind: 'type-changed',
        blocking: true,
        detail: `“${prop.name}” is no longer a files property, so the screenshot can't be attached to it. Choose another files property.`,
      });
    }
  }

  const dedupeId = preset.dedupe.propertyId;
  if (dedupeId !== null) {
    const prop = schema.properties[dedupeId];
    if (!prop) {
      issues.push({
        propertyId: dedupeId,
        kind: 'missing',
        blocking: true,
        detail:
          'The property used to detect duplicates was deleted or is no longer shared. Choose another URL property or turn off duplicate detection.',
      });
    } else if (!(DEDUPE_PROPERTY_TYPES as readonly string[]).includes(prop.type)) {
      issues.push({
        propertyId: dedupeId,
        kind: 'type-changed',
        blocking: true,
        detail: `“${prop.name}” is now a ${prop.type} property and can't be used to detect duplicates. Choose a URL or text property.`,
      });
    }
  }
  return issues;
}

/**
 * Returns a copy of the preset with renamed properties' snapshots refreshed
 * (call when the user re-saves after a rename notice).
 */
export function refreshPropertyNames(preset: Preset, schema: DataSourceSchema): Preset {
  return {
    ...preset,
    dataSourceName: schema.name || preset.dataSourceName,
    mappings: preset.mappings.map((m) => {
      const prop = schema.properties[m.propertyId];
      return prop && prop.name !== m.propertyName ? { ...m, propertyName: prop.name } : m;
    }),
  };
}
