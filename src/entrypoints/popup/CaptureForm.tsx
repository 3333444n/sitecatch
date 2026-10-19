import type { Ref } from 'preact';
import type { DataSourceSchema, PropertySchema } from '@/lib/notion/types';
import type { FormValue, FormValues, Mapping, Preset } from '@/lib/presets/types';
import { PropertyInput } from '@/ui/property-inputs';
import { summarizeValue } from './format';

/** `ask` mappings always show; extractor/static ones only with `editableInPopup`. */
export function isVisibleMapping(mapping: Mapping): boolean {
  return mapping.source.kind === 'ask' || mapping.editableInPopup;
}

export function isRequiredMapping(mapping: Mapping): boolean {
  return mapping.source.kind === 'ask' && mapping.source.required === true;
}

/** Live schema property, or one synthesized from the mapping snapshot (schema not loaded / property gone). */
export function propertyFor(mapping: Mapping, schema: DataSourceSchema | null): PropertySchema {
  const live = schema?.properties[mapping.propertyId];
  if (live?.type === mapping.propertyType) return live;
  return { id: mapping.propertyId, name: live?.name ?? mapping.propertyName, type: mapping.propertyType };
}

export interface CaptureFormProps {
  preset: Preset;
  schema: DataSourceSchema | null;
  values: FormValues;
  onChange: (propertyId: string, value: FormValue) => void;
  /** Property ids of required fields that are still empty. */
  missing: ReadonlySet<string>;
  /** Show "Required" errors on empty required fields (after a save attempt). */
  showMissing: boolean;
  disabled?: boolean;
  fieldsRef?: Ref<HTMLDivElement>;
}

export function CaptureForm({ preset, schema, values, onChange, missing, showMissing, disabled = false, fieldsRef }: CaptureFormProps) {
  const visible = preset.mappings.filter(isVisibleMapping);
  const fixed = preset.mappings.filter((m) => !isVisibleMapping(m));
  return (
    <>
      {visible.length > 0 && (
        <div class="popup-fields" ref={fieldsRef}>
          {visible.map((m) => {
            const value = values[m.propertyId];
            if (!value) return null;
            return (
              <PropertyInput
                key={m.propertyId}
                property={propertyFor(m, schema)}
                value={value}
                disabled={disabled}
                required={isRequiredMapping(m)}
                error={showMissing && missing.has(m.propertyId) ? 'Required' : undefined}
                onChange={(v) => {
                  onChange(m.propertyId, v);
                }}
              />
            );
          })}
        </div>
      )}
      {fixed.length > 0 && (
        <dl class="popup-summary" aria-label="Also saved">
          {fixed.map((m) => {
            const value = values[m.propertyId];
            const text = value ? summarizeValue(value) : '';
            return (
              <div class="popup-summary__row" key={m.propertyId}>
                <dt>{propertyFor(m, schema).name}</dt>
                <dd class={text ? undefined : 'popup-summary__empty'} title={text || undefined}>
                  <span aria-hidden="true">→ </span>
                  {text || 'empty'}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </>
  );
}
