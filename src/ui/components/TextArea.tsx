import type { TextareaHTMLAttributes } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { cx } from './cx';
import { useFieldControl } from './Field';

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes, 'value' | 'onChange' | 'onInput' | 'class' | 'rows' | 'id'> {
  value: string;
  onChange: (value: string) => void;
  /** Grow with content between minRows and maxRows (default true). */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  /** Show "n / max" (or just "n" without maxLength) below the textarea. */
  showCount?: boolean;
  invalid?: boolean;
  id?: string;
  class?: string;
}

export function TextArea({
  value,
  onChange,
  autoGrow = true,
  minRows = 2,
  maxRows = 8,
  showCount = false,
  maxLength,
  invalid,
  id,
  required,
  class: className,
  ...rest
}: TextAreaProps) {
  const field = useFieldControl(id);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isInvalid = invalid ?? field.invalid;
  const countId = `${field.id}-count`;
  const max = typeof maxLength === 'number' ? maxLength : undefined;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${String(el.scrollHeight + 2)}px`;
  }, [value, autoGrow]);

  const describedBy = [field.describedBy, showCount ? countId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div class="sc-textarea-wrap">
      <textarea
        aria-describedby={describedBy}
        {...rest}
        ref={ref}
        id={field.id}
        rows={minRows}
        value={value}
        maxLength={max}
        required={required ?? field.required}
        aria-invalid={isInvalid ? 'true' : undefined}
        class={cx('sc-input', 'sc-textarea', autoGrow && 'sc-textarea--auto', className)}
        style={autoGrow ? { maxHeight: `calc(${String(maxRows)} * 1.5em + 14px)` } : undefined}
        onInput={(e) => {
          onChange(e.currentTarget.value);
        }}
      />
      {showCount && (
        <span
          id={countId}
          class={cx('sc-textarea__count', max !== undefined && value.length >= max && 'sc-textarea__count--max')}
        >
          {max !== undefined ? `${String(value.length)} / ${String(max)}` : String(value.length)}
          <span class="sc-visually-hidden"> characters</span>
        </span>
      )}
    </div>
  );
}
