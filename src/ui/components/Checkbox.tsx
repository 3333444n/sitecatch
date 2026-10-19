import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { cx } from './cx';
import { useFieldControl } from './Field';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ComponentChildren;
  /** Secondary line under the label. */
  description?: ComponentChildren;
  indeterminate?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  class?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  indeterminate = false,
  disabled = false,
  id,
  name,
  class: className,
}: CheckboxProps) {
  const field = useFieldControl(id);
  const ref = useRef<HTMLInputElement>(null);
  const descId = description ? `${field.id}-desc` : undefined;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label class={cx('sc-check', disabled && 'sc-check--disabled', className)}>
      <input
        ref={ref}
        type="checkbox"
        class="sc-check__input"
        id={field.id}
        name={name}
        checked={checked}
        disabled={disabled}
        aria-describedby={[descId, field.describedBy].filter(Boolean).join(' ') || undefined}
        aria-invalid={field.invalid ? 'true' : undefined}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
      />
      <span class="sc-check__text">
        <span class="sc-check__label">{label}</span>
        {description && (
          <span id={descId} class="sc-check__description">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
