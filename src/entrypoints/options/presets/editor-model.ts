/**
 * Pure helpers behind the preset editor: which sources/extractors a property
 * may use, sensible defaults, and edits that keep the preset consistent.
 */
import { getExtractor } from '@/lib/extract/registry';
import type { ExtractorId } from '@/lib/extract/types';
import type { DataSourceSchema, PropertySchema, WritablePropertyType } from '@/lib/notion/types';
import { compatibleExtractors, formValueKindFor, isWritableType, supportsAsk, supportsStatic } from '@/lib/presets/compat';
import type { FormValue, Mapping, Preset, PresetIssue, ValueSource } from '@/lib/presets/types';
import { DEDUPE_PROPERTY_TYPES, validatePreset } from '@/lib/presets/validate';

export type SourceKind = ValueSource['kind'];

export type WritableProperty = PropertySchema & { type: WritablePropertyType };

/**
 * Extractors offered for a property type. The `screenshot` extractor is never
 * offered for `files` mappings: `preset.screenshot.filesPropertyId` is the one
 * canonical way to attach the screenshot.
 */
export function editorExtractors(type: PropertySchema['type']): ExtractorId[] {
  return compatibleExtractors(type).filter((id) => id !== 'screenshot');
}

export function availableSourceKinds(type: PropertySchema['type']): SourceKind[] {
  const kinds: SourceKind[] = [];
  if (editorExtractors(type).length > 0) kinds.push('extractor');
  if (supportsAsk(type)) kinds.push('ask');
  // A fixed `files` value would need a file picker; not offered in v0.
  if (supportsStatic(type) && type !== 'files') kinds.push('static');
  return kinds;
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  extractor: 'From the page',
  ask: 'Ask in popup',
  static: 'Fixed value',
};

export function extractorLabel(id: ExtractorId): string {
  return getExtractor(id)?.label ?? id;
}

export function extractorDescription(id: ExtractorId): string {
  return getExtractor(id)?.description ?? '';
}

export function emptyFormValue(type: WritablePropertyType): FormValue {
  switch (formValueKindFor(type)) {
    case 'text':
      return { kind: 'text', value: '' };
    case 'number':
      return { kind: 'number', value: null };
    case 'checkbox':
      return { kind: 'checkbox', value: false };
    case 'select':
      return { kind: 'select', value: null };
    case 'multi_select':
      return { kind: 'multi_select', value: [] };
    case 'date':
      return { kind: 'date', value: null };
    case 'files':
      return { kind: 'files', value: [] };
  }
}

/** Whether a value counts as "not set" (checkbox false is a real value). */
export function isEmptyValue(v: FormValue | undefined): boolean {
  if (!v) return true;
  switch (v.kind) {
    case 'text':
      return v.value.trim() === '';
    case 'number':
    case 'select':
    case 'date':
      return v.value === null;
    case 'multi_select':
    case 'files':
      return v.value.length === 0;
    case 'checkbox':
      return false;
  }
}

/** Preferred extractor (+ fallbacks) per property type when a mapping is switched on. */
const PREFERRED: Partial<Record<WritablePropertyType, { extractor: ExtractorId; fallbacks?: ExtractorId[] }>> = {
  title: { extractor: 'ogTitle', fallbacks: ['title'] },
  rich_text: { extractor: 'ogDescription', fallbacks: ['metaDescription'] },
  url: { extractor: 'url' },
  date: { extractor: 'dateSaved' },
  files: { extractor: 'ogImage' },
};

export function defaultSource(prop: WritableProperty, kind?: SourceKind): ValueSource {
  const kinds = availableSourceKinds(prop.type);
  const chosen: SourceKind | undefined =
    kind && kinds.includes(kind)
      ? kind
      : PREFERRED[prop.type]
        ? 'extractor'
        : kinds.includes('ask')
          ? 'ask'
          : kinds[0];
  if (chosen === 'extractor') {
    const allowed = editorExtractors(prop.type);
    const pref = PREFERRED[prop.type];
    if (pref && allowed.includes(pref.extractor)) {
      const fallbacks = (pref.fallbacks ?? []).filter((f) => allowed.includes(f));
      return fallbacks.length > 0
        ? { kind: 'extractor', extractor: pref.extractor, fallbacks }
        : { kind: 'extractor', extractor: pref.extractor };
    }
    const first = allowed[0];
    if (first) return { kind: 'extractor', extractor: first };
  }
  if (chosen === 'static') return { kind: 'static', value: emptyFormValue(prop.type) };
  return { kind: 'ask' };
}

export function defaultMapping(prop: WritableProperty, kind?: SourceKind): Mapping {
  const source = defaultSource(prop, kind);
  return {
    propertyId: prop.id,
    propertyName: prop.name,
    propertyType: prop.type,
    source,
    // Ask fields always show; extractor titles are worth a quick check.
    editableInPopup: source.kind === 'ask' || prop.type === 'title',
  };
}

export function changeSourceKind(mapping: Mapping, prop: WritableProperty, kind: SourceKind): Mapping {
  if (mapping.source.kind === kind) return mapping;
  const source = defaultSource(prop, kind);
  return {
    ...mapping,
    source,
    editableInPopup: source.kind === 'ask' ? true : mapping.editableInPopup,
  };
}

/** Replaces (or appends) the mapping for `mapping.propertyId`, keeping order. */
export function upsertMapping(preset: Preset, mapping: Mapping): Preset {
  const i = preset.mappings.findIndex((m) => m.propertyId === mapping.propertyId);
  const mappings = [...preset.mappings];
  if (i === -1) mappings.push(mapping);
  else mappings[i] = mapping;
  return { ...preset, mappings };
}

export function removeMapping(preset: Preset, propertyId: string): Preset {
  return { ...preset, mappings: preset.mappings.filter((m) => m.propertyId !== propertyId) };
}

/**
 * Sets the files property that receives the screenshot. A mapping on that same
 * property is removed (the screenshot attachment replaces it).
 */
export function setScreenshotProperty(preset: Preset, propertyId: string | null): Preset {
  const next: Preset = { ...preset, screenshot: { ...preset.screenshot, filesPropertyId: propertyId } };
  return propertyId === null ? next : removeMapping(next, propertyId);
}

/** Writable properties, title first, then schema order. */
export function writableProperties(schema: DataSourceSchema): WritableProperty[] {
  const all = Object.values(schema.properties).filter((p): p is WritableProperty => isWritableType(p.type));
  return [...all.filter((p) => p.type === 'title'), ...all.filter((p) => p.type !== 'title')];
}

export function readOnlyProperties(schema: DataSourceSchema): PropertySchema[] {
  return Object.values(schema.properties).filter((p) => !isWritableType(p.type));
}

export function filesProperties(schema: DataSourceSchema): PropertySchema[] {
  return Object.values(schema.properties).filter((p) => p.type === 'files');
}

export function dedupeCandidates(schema: DataSourceSchema): PropertySchema[] {
  const ok = DEDUPE_PROPERTY_TYPES as readonly string[];
  const props = Object.values(schema.properties).filter((p) => ok.includes(p.type));
  // url properties first: they're the natural choice.
  return [...props.filter((p) => p.type === 'url'), ...props.filter((p) => p.type !== 'url')];
}

/** Mappings (and screenshot/dedupe refs) whose property isn't in the schema. */
export function missingMappings(preset: Preset, schema: DataSourceSchema): Mapping[] {
  return preset.mappings.filter((m) => !(m.propertyId in schema.properties));
}

/** Drops mappings and references that don't exist in `schema` (after changing the database). */
export function pruneToSchema(preset: Preset, schema: DataSourceSchema): Preset {
  const has = (id: string | null) => id !== null && id in schema.properties;
  const filesId = preset.screenshot.filesPropertyId;
  const dedupeId = preset.dedupe.propertyId;
  return {
    ...preset,
    mappings: preset.mappings.filter((m) => has(m.propertyId)),
    screenshot: { ...preset.screenshot, filesPropertyId: has(filesId) ? filesId : null },
    dedupe: { propertyId: has(dedupeId) ? dedupeId : (dedupeCandidates(schema).find((p) => p.type === 'url')?.id ?? null) },
  };
}

/** `validatePreset` plus editor-only checks (empty name, empty fixed values). */
export function editorIssues(preset: Preset, schema: DataSourceSchema): PresetIssue[] {
  const issues = validatePreset(preset, schema);
  if (preset.name.trim() === '') {
    issues.unshift({ propertyId: '', kind: 'missing', blocking: true, detail: 'Give the preset a name.' });
  }
  for (const m of preset.mappings) {
    if (m.source.kind === 'static' && isEmptyValue(m.source.value) && m.source.value.kind !== 'checkbox') {
      issues.push({
        propertyId: m.propertyId,
        kind: 'missing',
        blocking: true,
        detail: `Set a fixed value for “${m.propertyName}”, or choose another source.`,
      });
    }
    if (m.source.kind === 'extractor' && m.source.extractor === 'screenshot') {
      issues.push({
        propertyId: m.propertyId,
        kind: 'renamed',
        blocking: false,
        detail: `“${m.propertyName}” gets the screenshot through an old-style mapping. Use “Attach screenshot to” in the Screenshot section instead.`,
      });
    }
  }
  return issues;
}

/** Normalizes before saving: empty ask defaults are dropped, ask mappings are always shown. */
export function normalizeForSave(preset: Preset): Preset {
  return {
    ...preset,
    name: preset.name.trim(),
    mappings: preset.mappings.map((m) => {
      if (m.source.kind !== 'ask') return m;
      const { default: def, required } = m.source;
      const source: ValueSource = { kind: 'ask' };
      if (def && !isEmptyValue(def)) source.default = def;
      if (required) source.required = true;
      return { ...m, source, editableInPopup: true };
    }),
  };
}
