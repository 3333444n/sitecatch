/** One writable schema property in the preset editor: include toggle + source config. */
import type { ExtractorId } from '@/lib/extract/types';
import type { FormValue, Mapping, PresetIssue } from '@/lib/presets/types';
import { Badge, Button, Field, Select, Toggle } from '@/ui/components';
import { PropertyInput } from '@/ui/property-inputs';
import {
  availableSourceKinds,
  changeSourceKind,
  defaultMapping,
  editorExtractors,
  emptyFormValue,
  extractorDescription,
  extractorLabel,
  SOURCE_KIND_LABEL,
  type SourceKind,
  type WritableProperty,
} from './editor-model';

export const TYPE_LABEL: Record<WritableProperty['type'], string> = {
  title: 'Title',
  rich_text: 'Text',
  number: 'Number',
  select: 'Select',
  multi_select: 'Multi-select',
  status: 'Status',
  date: 'Date',
  files: 'Files',
  checkbox: 'Checkbox',
  url: 'URL',
  email: 'Email',
  phone_number: 'Phone',
};

export interface PropertyRowProps {
  property: WritableProperty;
  mapping: Mapping | undefined;
  issues: PresetIssue[];
  /** This files property receives the screenshot (configured in the Screenshot section). */
  isScreenshotTarget: boolean;
  onChange: (mapping: Mapping | null) => void;
  onUseAsScreenshotTarget?: () => void;
}

export function PropertyRow({
  property,
  mapping,
  issues,
  isScreenshotTarget,
  onChange,
  onUseAsScreenshotTarget,
}: PropertyRowProps) {
  const kinds = availableSourceKinds(property.type);
  const included = mapping !== undefined;
  const rowId = `sco-prop-${property.id}`;
  const blocking = issues.some((i) => i.blocking);

  return (
    <li
      class={`sco-prop${included ? ' sco-prop--on' : ''}${blocking ? ' sco-prop--invalid' : ''}`}
      data-property-id={property.id}
      aria-labelledby={`${rowId}-name`}
    >
      <div class="sco-prop__head">
        <div class="sco-prop__title">
          <span id={`${rowId}-name`} class="sco-prop__name">
            {property.name}
          </span>
          <Badge>{TYPE_LABEL[property.type]}</Badge>
        </div>
        {isScreenshotTarget ? (
          <span class="sco-prop__note">Gets the screenshot</span>
        ) : (
          <Toggle
            label={<span class="sc-visually-hidden">Include {property.name}</span>}
            checked={included}
            onChange={(on) => {
              onChange(on ? defaultMapping(property) : null);
            }}
          />
        )}
      </div>

      {isScreenshotTarget && (
        <p class="sco-prop__hint">The screenshot is attached here. Change it in the Screenshot section below.</p>
      )}

      {mapping && !isScreenshotTarget && (
        <div class="sco-prop__body">
          <div class="sco-prop__source" role="radiogroup" aria-label={`Where “${property.name}” gets its value`}>
            {kinds.map((k) => (
              <label key={k} class={`sco-seg${mapping.source.kind === k ? ' sco-seg--on' : ''}`}>
                <input
                  type="radio"
                  class="sc-visually-hidden"
                  name={`${rowId}-source`}
                  value={k}
                  checked={mapping.source.kind === k}
                  onChange={() => {
                    onChange(changeSourceKind(mapping, property, k));
                  }}
                />
                {SOURCE_KIND_LABEL[k]}
              </label>
            ))}
          </div>
          <SourceEditor property={property} mapping={mapping} onChange={onChange} onUseAsScreenshotTarget={onUseAsScreenshotTarget} />
        </div>
      )}

      {issues.length > 0 && (
        <ul class="sco-prop__issues">
          {issues.map((i) => (
            <li key={i.kind + i.detail} class={i.blocking ? 'sco-issue sco-issue--blocking' : 'sco-issue'}>
              {i.detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SourceEditor({
  property,
  mapping,
  onChange,
  onUseAsScreenshotTarget,
}: {
  property: WritableProperty;
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  onUseAsScreenshotTarget?: () => void;
}) {
  const { source } = mapping;
  const extractors = editorExtractors(property.type);

  if (source.kind === 'extractor') {
    const legacyScreenshot = source.extractor === 'screenshot';
    const primaryOptions = extractors.map((id) => ({ value: id, label: extractorLabel(id) }));
    const fallback = source.fallbacks?.[0] ?? null;
    const fallbackOptions = extractors
      .filter((id) => id !== source.extractor)
      .map((id) => ({ value: id, label: extractorLabel(id) }));
    return (
      <div class="sco-prop__fields">
        {legacyScreenshot ? (
          <div class="sco-prop__legacy">
            <p class="sco-prop__hint">This property gets the screenshot through an old-style mapping.</p>
            {onUseAsScreenshotTarget && (
              <Button size="sm" onClick={onUseAsScreenshotTarget}>
                Attach screenshot here instead
              </Button>
            )}
          </div>
        ) : (
          <>
            <Field label="Extractor" hint={extractorDescription(source.extractor)}>
              <Select
                options={primaryOptions}
                value={source.extractor}
                onChange={(v) => {
                  if (v === null) return;
                  const extractor = v as ExtractorId;
                  const fallbacks = (source.fallbacks ?? []).filter((f) => f !== extractor);
                  onChange({
                    ...mapping,
                    source: fallbacks.length > 0 ? { kind: 'extractor', extractor, fallbacks } : { kind: 'extractor', extractor },
                  });
                }}
              />
            </Field>
            {fallbackOptions.length > 0 && (
              <Field
                label="Fallback"
                hint={fallback ? `Used when the page has no ${extractorLabel(source.extractor)}. ${extractorDescription(fallback)}` : 'Optional. Used when the page has no value for the extractor above.'}
              >
                <Select
                  options={fallbackOptions}
                  value={fallback}
                  placeholder="No fallback"
                  onChange={(v) => {
                    onChange({
                      ...mapping,
                      source:
                        v === null
                          ? { kind: 'extractor', extractor: source.extractor }
                          : { kind: 'extractor', extractor: source.extractor, fallbacks: [v as ExtractorId] },
                    });
                  }}
                />
              </Field>
            )}
          </>
        )}
        <Toggle
          label="Editable in popup"
          description="Show the extracted value in the popup so you can tweak it before saving."
          checked={mapping.editableInPopup}
          onChange={(on) => {
            onChange({ ...mapping, editableInPopup: on });
          }}
        />
      </div>
    );
  }

  if (source.kind === 'ask') {
    const value: FormValue = source.default ?? emptyFormValue(property.type);
    return (
      <div class="sco-prop__fields">
        <PropertyInput
          property={property}
          label="Default value (optional)"
          value={value}
          onChange={(v) => {
            onChange({ ...mapping, source: { ...source, default: v } });
          }}
        />
        <Toggle
          label="Required"
          description="Block saving until this field is filled in."
          checked={source.required === true}
          onChange={(on) => {
            onChange({ ...mapping, source: { ...source, required: on } });
          }}
        />
      </div>
    );
  }

  return (
    <div class="sco-prop__fields">
      <PropertyInput
        property={property}
        label="Value"
        required
        value={source.value}
        onChange={(v) => {
          onChange({ ...mapping, source: { kind: 'static', value: v } });
        }}
      />
      <Toggle
        label="Editable in popup"
        description="Show the value in the popup so you can change it for a single save."
        checked={mapping.editableInPopup}
        onChange={(on) => {
          onChange({ ...mapping, editableInPopup: on });
        }}
      />
    </div>
  );
}

export type { SourceKind };
