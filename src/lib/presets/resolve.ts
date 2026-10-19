/**
 * Computes the popup's initial form values from a preset and a capture.
 * Every mapping gets a value (empty when nothing resolves) so the form can
 * render all editable properties.
 */
import type { CaptureResult, ExtractedValue, ExtractorId } from '@/lib/extract/types';
import type { WritablePropertyType } from '@/lib/notion/types';
import { formValueKindFor } from './compat';
import type { FileRef, FormValue, FormValues, Mapping, Preset } from './types';
import { emptyFormValue, fitsPropertyType, isEmptyFormValue } from './values';

/** Value of an extractor in this capture, synthesizing the basics restricted pages still have. */
function extracted(capture: CaptureResult, id: ExtractorId): ExtractedValue | undefined {
  const value = capture.values[id];
  if (value) return value;
  if (id === 'url' && capture.url) return { kind: 'url', value: capture.url };
  if (id === 'title' && capture.title) return { kind: 'text', value: capture.title };
  if (id === 'dateSaved' && capture.capturedAt) return { kind: 'date', value: capture.capturedAt };
  return undefined;
}

function textToForm(text: string, type: WritablePropertyType): FormValue | null {
  const value = text.trim();
  if (value === '') return null;
  switch (formValueKindFor(type)) {
    case 'text':
      return { kind: 'text', value };
    case 'select':
      return { kind: 'select', value };
    case 'multi_select':
      return { kind: 'multi_select', value: [value] };
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? { kind: 'number', value: n } : null;
    }
    case 'date':
      return Number.isNaN(Date.parse(value)) ? null : { kind: 'date', value: { start: value } };
    default:
      return null;
  }
}

function imageFileRef(extractor: ExtractorId, v: Extract<ExtractedValue, { kind: 'image' }>): FileRef | null {
  if (extractor === 'screenshot') return v.dataUrl || v.url ? { kind: 'screenshot' } : null;
  if (!v.url) return null;
  return { kind: 'external', url: v.url, name: fileNameFromUrl(v.url, extractor) };
}

/** Readable file name for an external file (Notion requires one). */
export function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const { pathname, hostname } = new URL(url);
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    return (last || hostname || fallback).slice(0, 100);
  } catch {
    return fallback;
  }
}

/** Converts an extracted value into the form value for the target property type, or null if impossible/empty. */
export function extractedToFormValue(
  value: ExtractedValue,
  extractor: ExtractorId,
  type: WritablePropertyType,
): FormValue | null {
  switch (value.kind) {
    case 'text':
    case 'url':
      return textToForm(value.value, type);
    case 'list': {
      const items = value.value.map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return null;
      const kind = formValueKindFor(type);
      if (kind === 'multi_select') return { kind: 'multi_select', value: items };
      if (kind === 'select') return { kind: 'select', value: items[0] ?? null };
      if (kind === 'text') return { kind: 'text', value: items.join(', ') };
      return null;
    }
    case 'date': {
      if (value.value === '') return null;
      if (type === 'date') return { kind: 'date', value: { start: value.value } };
      return formValueKindFor(type) === 'text' ? { kind: 'text', value: value.value } : null;
    }
    case 'image': {
      if (type === 'files') {
        const ref = imageFileRef(extractor, value);
        return ref ? { kind: 'files', value: [ref] } : null;
      }
      if (formValueKindFor(type) === 'text' && value.url) return { kind: 'text', value: value.url };
      return null;
    }
  }
}

function resolveMapping(mapping: Mapping, capture: CaptureResult): FormValue {
  const type = mapping.propertyType;
  const source = mapping.source;
  switch (source.kind) {
    case 'extractor': {
      for (const id of [source.extractor, ...(source.fallbacks ?? [])]) {
        const value = extracted(capture, id);
        if (!value) continue;
        const form = extractedToFormValue(value, id, type);
        if (form && !isEmptyFormValue(form)) return form;
      }
      return emptyFormValue(type);
    }
    case 'ask':
      return source.default && fitsPropertyType(source.default, type)
        ? structuredClone(source.default)
        : emptyFormValue(type);
    case 'static':
      return fitsPropertyType(source.value, type) ? structuredClone(source.value) : emptyFormValue(type);
  }
}

export function resolveInitialValues(preset: Preset, capture: CaptureResult): FormValues {
  const values: FormValues = {};
  for (const mapping of preset.mappings) {
    values[mapping.propertyId] = resolveMapping(mapping, capture);
  }
  return values;
}
