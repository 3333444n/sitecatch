import type { InputHTMLAttributes, Ref } from 'preact';
import { cx } from './cx';
import { useFieldControl } from './Field';

export interface TextInputProps
  extends Omit<InputHTMLAttributes, 'value' | 'onChange' | 'onInput' | 'class' | 'type' | 'size' | 'id'> {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'url' | 'email' | 'tel' | 'search' | 'password' | 'number' | 'date' | 'datetime-local';
  /** Force the invalid style (also set automatically inside a <Field error>). */
  invalid?: boolean;
  /** Monospace text (tokens, ids). */
  mono?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  id?: string;
  class?: string;
}

export function TextInput({
  value,
  onChange,
  type = 'text',
  invalid,
  mono = false,
  id,
  required,
  inputRef,
  class: className,
  ...rest
}: TextInputProps) {
  const field = useFieldControl(id);
  const isInvalid = invalid ?? field.invalid;
  return (
    <input
      aria-describedby={field.describedBy}
      {...rest}
      ref={inputRef}
      id={field.id}
      type={type}
      value={value}
      required={required ?? field.required}
      aria-invalid={isInvalid ? 'true' : undefined}
      class={cx('sc-input', mono && 'sc-input--mono', className)}
      onInput={(e) => {
        onChange(e.currentTarget.value);
      }}
    />
  );
}
