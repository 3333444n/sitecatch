import type { ComponentChildren } from 'preact';
import { cx } from './cx';
import { useFieldControl } from './Field';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ComponentChildren;
  description?: ComponentChildren;
  disabled?: boolean;
  /** Put the switch before the label (default: after, settings-row style). */
  switchFirst?: boolean;
  id?: string;
  class?: string;
}

/** On/off switch (checkbox with role="switch"). */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  switchFirst = false,
  id,
  class: className,
}: ToggleProps) {
  const field = useFieldControl(id);
  const descId = description ? `${field.id}-desc` : undefined;
  return (
    <label
      class={cx('sc-toggle', switchFirst && 'sc-toggle--switch-first', disabled && 'sc-toggle--disabled', className)}
    >
      <span class="sc-toggle__text">
        <span class="sc-toggle__label">{label}</span>
        {description && (
          <span id={descId} class="sc-toggle__description">
            {description}
          </span>
        )}
      </span>
      <span class="sc-toggle__control">
        <input
          type="checkbox"
          role="switch"
          class="sc-toggle__input"
          id={field.id}
          checked={checked}
          aria-checked={checked ? 'true' : 'false'}
          disabled={disabled}
          aria-describedby={[descId, field.describedBy].filter(Boolean).join(' ') || undefined}
          onChange={(e) => {
            onChange(e.currentTarget.checked);
          }}
        />
        <span class="sc-toggle__track" aria-hidden="true">
          <span class="sc-toggle__thumb" />
        </span>
      </span>
    </label>
  );
}
