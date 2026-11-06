import type { SelectHTMLAttributes } from 'preact';
import { cx } from './cx';
import { useFieldControl } from './Field';
import { Icon } from './Icon';

export interface SelectOptionItem {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options with a group are rendered inside an <optgroup> of that label (in first-seen order). */
  group?: string;
}

function renderOption(o: SelectOptionItem) {
  return (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  );
}

/** Ungrouped options first, then one <optgroup> per group label. */
function renderOptions(options: SelectOptionItem[]) {
  if (!options.some((o) => o.group !== undefined)) return options.map(renderOption);
  const groups = new Map<string, SelectOptionItem[]>();
  const loose: SelectOptionItem[] = [];
  for (const o of options) {
    if (o.group === undefined) loose.push(o);
    else groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
  }
  return [
    ...loose.map(renderOption),
    ...[...groups].map(([label, items]) => (
      <optgroup key={`group:${label}`} label={label}>
        {items.map(renderOption)}
      </optgroup>
    )),
  ];
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes, 'value' | 'onChange' | 'onInput' | 'class' | 'size' | 'multiple' | 'id'> {
  options: SelectOptionItem[];
  /** Selected value; `null` selects the placeholder. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Adds an empty first option that maps to `null` (e.g. "Choose a database…"). */
  placeholder?: string;
  invalid?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  class?: string;
}

/** Native <select> with kit styling. */
export function Select({
  options,
  value,
  onChange,
  placeholder,
  invalid,
  size = 'md',
  id,
  required,
  class: className,
  ...rest
}: SelectProps) {
  const field = useFieldControl(id);
  const isInvalid = invalid ?? field.invalid;
  return (
    <span class={cx('sc-select', `sc-select--${size}`, className)}>
      <select
        aria-describedby={field.describedBy}
        {...rest}
        id={field.id}
        class="sc-select__control"
        value={value ?? ''}
        required={required ?? field.required}
        aria-invalid={isInvalid ? 'true' : undefined}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onChange(v === '' && placeholder !== undefined ? null : v);
        }}
      >
        {placeholder !== undefined && (
          <option value="" disabled={required ?? field.required}>
            {placeholder}
          </option>
        )}
        {renderOptions(options)}
      </select>
      <Icon name="chevron-down" size={14} class="sc-select__chevron" />
    </span>
  );
}
