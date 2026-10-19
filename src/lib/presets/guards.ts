/**
 * Hand-written structural guards for presets coming from untrusted sources
 * (imported JSON, storage.sync written by another version). No zod on purpose:
 * keeps the bundle small and the checks explicit.
 */
import type { ExtractorId } from '@/lib/extract/types';
import type { WritablePropertyType } from '@/lib/notion/types';
import { WRITABLE_PROPERTY_TYPES } from '@/lib/notion/types';
import { EXTRACTOR_OUTPUT } from './compat';
import type { FileRef, FormValue, Mapping, Preset, ValueSource } from './types';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isStr);
}
function isOptional(v: unknown, guard: (x: unknown) => boolean): boolean {
  return v === undefined || guard(v);
}

export function isExtractorId(v: unknown): v is ExtractorId {
  return isStr(v) && Object.hasOwn(EXTRACTOR_OUTPUT, v);
}

export function isWritablePropertyTypeValue(v: unknown): v is WritablePropertyType {
  return isStr(v) && (WRITABLE_PROPERTY_TYPES as readonly string[]).includes(v);
}

export function isFileRef(v: unknown): v is FileRef {
  if (!isObj(v)) return false;
  if (v.kind === 'screenshot') return true;
  return v.kind === 'external' && isStr(v.url) && isOptional(v.name, isStr);
}

export function isFormValue(v: unknown): v is FormValue {
  if (!isObj(v)) return false;
  const value = v.value;
  switch (v.kind) {
    case 'text':
      return isStr(value);
    case 'number':
      return value === null || (typeof value === 'number' && Number.isFinite(value));
    case 'checkbox':
      return typeof value === 'boolean';
    case 'select':
      return value === null || isStr(value);
    case 'multi_select':
      return isStrArray(value);
    case 'date':
      return (
        value === null ||
        (isObj(value) && isStr(value.start) && isOptional(value.end, isStr))
      );
    case 'files':
      return Array.isArray(value) && value.every(isFileRef);
    default:
      return false;
  }
}

export function isValueSource(v: unknown): v is ValueSource {
  if (!isObj(v)) return false;
  switch (v.kind) {
    case 'extractor':
      return (
        isExtractorId(v.extractor) &&
        (v.fallbacks === undefined || (Array.isArray(v.fallbacks) && v.fallbacks.every(isExtractorId)))
      );
    case 'ask':
      return (
        isOptional(v.default, isFormValue) &&
        (v.required === undefined || typeof v.required === 'boolean')
      );
    case 'static':
      return isFormValue(v.value);
    default:
      return false;
  }
}

export function isMapping(v: unknown): v is Mapping {
  return (
    isObj(v) &&
    isStr(v.propertyId) &&
    v.propertyId !== '' &&
    isStr(v.propertyName) &&
    isWritablePropertyTypeValue(v.propertyType) &&
    isValueSource(v.source) &&
    typeof v.editableInPopup === 'boolean'
  );
}

/** Full structural check of a v1 preset. */
export function isPreset(v: unknown): v is Preset {
  if (!isObj(v)) return false;
  const { screenshot, dedupe } = v;
  return (
    v.schemaVersion === 1 &&
    isStr(v.id) &&
    v.id !== '' &&
    isStr(v.name) &&
    isStr(v.dataSourceId) &&
    v.dataSourceId !== '' &&
    isStr(v.dataSourceName) &&
    Array.isArray(v.mappings) &&
    v.mappings.every(isMapping) &&
    isObj(screenshot) &&
    (screenshot.filesPropertyId === null || isStr(screenshot.filesPropertyId)) &&
    typeof screenshot.bodyImage === 'boolean' &&
    (v.cover === 'none' || v.cover === 'screenshot' || v.cover === 'ogImage') &&
    (v.icon === 'none' || v.icon === 'favicon') &&
    isObj(dedupe) &&
    (dedupe.propertyId === null || isStr(dedupe.propertyId)) &&
    isStr(v.updatedAt)
  );
}

/** Rebuilds a preset with only known keys (drops anything extra an import may carry). */
export function clonePreset(p: Preset): Preset {
  return {
    schemaVersion: 1,
    id: p.id,
    name: p.name,
    dataSourceId: p.dataSourceId,
    dataSourceName: p.dataSourceName,
    mappings: p.mappings.map((m) => ({
      propertyId: m.propertyId,
      propertyName: m.propertyName,
      propertyType: m.propertyType,
      source: structuredClone(m.source),
      editableInPopup: m.editableInPopup,
    })),
    screenshot: { filesPropertyId: p.screenshot.filesPropertyId, bodyImage: p.screenshot.bodyImage },
    cover: p.cover,
    icon: p.icon,
    dedupe: { propertyId: p.dedupe.propertyId },
    updatedAt: p.updatedAt,
  };
}
