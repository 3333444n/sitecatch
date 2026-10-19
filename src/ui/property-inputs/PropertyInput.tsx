import type { ComponentChildren } from 'preact';
import type { NotionPropertyType, PropertySchema } from '@/lib/notion/types';
import type { FileRef, FormValue } from '@/lib/presets/types';
import { Checkbox } from '@/ui/components/Checkbox';
import { Field } from '@/ui/components/Field';
import { TextArea } from '@/ui/components/TextArea';
import { TextInput } from '@/ui/components/TextInput';
import { DateInput, type DateValue } from './DateInput';
import { FilesList } from './FilesList';
import { NumberInput } from './NumberInput';
import { OptionPicker } from './OptionPicker';

export interface PropertyInputProps {
  property: PropertySchema;
  value: FormValue;
  onChange: (value: FormValue) => void;
  disabled?: boolean;
  /** Required marker + aria-required. */
  required?: boolean;
  /** Validation message shown under the control. */
  error?: ComponentChildren;
  hint?: ComponentChildren;
  /** Label override (defaults to the property name). */
  label?: ComponentChildren;
}

// ---- value coercion (a mismatched kind renders as empty rather than crashing) ----

function textOf(v: FormValue): string {
  return v.kind === 'text' ? v.value : '';
}
function numberOf(v: FormValue): number | null {
  return v.kind === 'number' ? v.value : null;
}
function boolOf(v: FormValue): boolean {
  return v.kind === 'checkbox' ? v.value : false;
}
function selectOf(v: FormValue): string | null {
  return v.kind === 'select' ? v.value : null;
}
function multiOf(v: FormValue): string[] {
  return v.kind === 'multi_select' ? v.value : [];
}
function dateOf(v: FormValue): DateValue {
  return v.kind === 'date' ? v.value : null;
}
function filesOf(v: FormValue): FileRef[] {
  return v.kind === 'files' ? v.value : [];
}

const TEXT_INPUT_TYPE: Partial<Record<NotionPropertyType, 'url' | 'email' | 'tel'>> = {
  url: 'url',
  email: 'email',
  phone_number: 'tel',
};

const PLACEHOLDER: Partial<Record<NotionPropertyType, string>> = {
  url: 'https://…',
  email: 'name@example.com',
  phone_number: '+1 555 0100',
};

const TYPE_LABEL: Partial<Record<NotionPropertyType, string>> = {
  people: 'People',
  relation: 'Relation',
  formula: 'Formula',
  rollup: 'Rollup',
  created_time: 'Created time',
  created_by: 'Created by',
  last_edited_time: 'Last edited time',
  last_edited_by: 'Last edited by',
  unique_id: 'ID',
  verification: 'Verification',
  button: 'Button',
};

/**
 * Renders the right editor for a Notion property, labelled with its name.
 * Controlled: `value` in, a new `FormValue` out via `onChange`.
 */
export function PropertyInput({
  property,
  value,
  onChange,
  disabled = false,
  required = false,
  error,
  hint,
  label,
}: PropertyInputProps) {
  const name = label ?? property.name;
  const fieldProps = { label: name, required, error, hint };
  const { type } = property;

  switch (type) {
    case 'title':
    case 'rich_text':
      return (
        <Field {...fieldProps}>
          <TextArea
            value={textOf(value)}
            minRows={type === 'title' ? 1 : 2}
            maxRows={type === 'title' ? 4 : 8}
            disabled={disabled}
            onChange={(v) => {
              onChange({ kind: 'text', value: v });
            }}
          />
        </Field>
      );
    case 'url':
    case 'email':
    case 'phone_number':
      return (
        <Field {...fieldProps}>
          <TextInput
            type={TEXT_INPUT_TYPE[type]}
            value={textOf(value)}
            placeholder={PLACEHOLDER[type]}
            disabled={disabled}
            autoComplete="off"
            onChange={(v) => {
              onChange({ kind: 'text', value: v });
            }}
          />
        </Field>
      );
    case 'number':
      return (
        <Field {...fieldProps}>
          <NumberInput
            value={numberOf(value)}
            disabled={disabled}
            onChange={(v) => {
              onChange({ kind: 'number', value: v });
            }}
          />
        </Field>
      );
    case 'checkbox':
      return (
        <div class="sc-field sc-field--inline">
          <Checkbox
            label={name}
            checked={boolOf(value)}
            disabled={disabled}
            onChange={(v) => {
              onChange({ kind: 'checkbox', value: v });
            }}
          />
          {error && <p class="sc-field__error">{error}</p>}
          {hint && <p class="sc-field__hint">{hint}</p>}
        </div>
      );
    case 'select':
    case 'status': {
      const current = selectOf(value);
      return (
        <Field {...fieldProps}>
          <OptionPicker
            options={property.options ?? []}
            value={current === null ? [] : [current]}
            allowCreate={type === 'select'}
            pill={type === 'status'}
            disabled={disabled}
            placeholder={type === 'status' ? 'Pick a status' : 'Pick or create an option'}
            listLabel={`${property.name} options`}
            onChange={(names) => {
              onChange({ kind: 'select', value: names[names.length - 1] ?? null });
            }}
          />
        </Field>
      );
    }
    case 'multi_select':
      return (
        <Field {...fieldProps}>
          <OptionPicker
            multiple
            allowCreate
            options={property.options ?? []}
            value={multiOf(value)}
            disabled={disabled}
            placeholder="Pick or create options"
            listLabel={`${property.name} options`}
            onChange={(names) => {
              onChange({ kind: 'multi_select', value: names });
            }}
          />
        </Field>
      );
    case 'date':
      return (
        <Field {...fieldProps}>
          <DateInput
            value={dateOf(value)}
            disabled={disabled}
            onChange={(v) => {
              onChange({ kind: 'date', value: v });
            }}
          />
        </Field>
      );
    case 'files':
      return (
        <Field {...fieldProps} group>
          <FilesList value={filesOf(value)} />
        </Field>
      );
    default:
      return (
        <Field {...fieldProps} group>
          <p class="sc-prop-note">
            {TYPE_LABEL[type] ?? 'This'} properties can’t be edited from Sitecatch.
          </p>
        </Field>
      );
  }
}
