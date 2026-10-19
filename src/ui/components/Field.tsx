import { createContext, type ComponentChildren } from 'preact';
import { useContext, useId } from 'preact/hooks';
import { cx } from './cx';

export interface FieldContextValue {
  /** id for the control (wired to the label's `for`). */
  id: string;
  /** Space-separated ids of hint/error text for aria-describedby. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Lets controls (TextInput, TextArea, Select, …) pick up the id/aria wiring of an
 * enclosing <Field>. Explicit props on the control win.
 */
export function useFieldControl(explicitId?: string): FieldContextValue {
  const ctx = useContext(FieldContext);
  const fallbackId = useId();
  return {
    id: explicitId ?? ctx?.id ?? fallbackId,
    describedBy: ctx?.describedBy,
    invalid: ctx?.invalid ?? false,
    required: ctx?.required ?? false,
  };
}

export interface FieldProps {
  label: ComponentChildren;
  /** Helper text below the control. */
  hint?: ComponentChildren;
  /** Error text; marks the control aria-invalid. */
  error?: ComponentChildren;
  /** Shows a required marker and sets aria-required on the control. */
  required?: boolean;
  /** Control id (generated when omitted). */
  id?: string;
  /**
   * Render as a labelled group (role="group") instead of <label for>. Use for
   * composite controls (date + toggle, chip lists) or read-only content.
   */
  group?: boolean;
  /** Visually hide the label (kept for screen readers). */
  hideLabel?: boolean;
  /** Extra element on the label row's right side (e.g. a counter or link). */
  aside?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  id: explicitId,
  group = false,
  hideLabel = false,
  aside,
  class: className,
  children,
}: FieldProps) {
  const generated = useId();
  const id = explicitId ?? `sc-field-${generated}`;
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const ctx: FieldContextValue = { id, describedBy, invalid: Boolean(error), required };

  const labelContent = (
    <>
      {label}
      {required && (
        <span class="sc-field__required" aria-hidden="true">
          {' '}
          *
        </span>
      )}
      {required && <span class="sc-visually-hidden"> (required)</span>}
    </>
  );
  const labelClass = cx('sc-field__label', hideLabel && 'sc-visually-hidden');

  const body = (
    <>
      <div class="sc-field__label-row">
        {group ? (
          <span id={labelId} class={labelClass}>
            {labelContent}
          </span>
        ) : (
          <label id={labelId} for={id} class={labelClass}>
            {labelContent}
          </label>
        )}
        {aside && <span class="sc-field__aside">{aside}</span>}
      </div>
      <FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
      {error && (
        <p id={errorId} class="sc-field__error">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} class="sc-field__hint">
          {hint}
        </p>
      )}
    </>
  );

  return group ? (
    <div
      class={cx('sc-field', error ? 'sc-field--invalid' : undefined, className)}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
    >
      {body}
    </div>
  ) : (
    <div class={cx('sc-field', error ? 'sc-field--invalid' : undefined, className)}>{body}</div>
  );
}
