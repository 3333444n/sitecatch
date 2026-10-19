import { useEffect, useState } from 'preact/hooks';
import { cx } from '@/ui/components/cx';
import { useFieldControl } from '@/ui/components/Field';

export interface NumberInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

function parse(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Number field that keeps the user's in-progress text ("1.", "-") while only
 * emitting valid numbers (or null when cleared).
 */
export function NumberInput({ value, onChange, disabled = false, placeholder, id }: NumberInputProps) {
  const field = useFieldControl(id);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [bad, setBad] = useState(false);

  useEffect(() => {
    // Sync external changes without clobbering equivalent drafts ("1." vs 1).
    if (parse(draft) !== value) {
      setDraft(value === null ? '' : String(value));
      setBad(false);
    }
  }, [value]);

  return (
    <input
      id={field.id}
      type="text"
      inputMode="decimal"
      class={cx('sc-input', 'sc-input--number')}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      aria-describedby={field.describedBy}
      aria-invalid={bad || field.invalid ? 'true' : undefined}
      aria-required={field.required ? 'true' : undefined}
      onInput={(e) => {
        const text = e.currentTarget.value;
        setDraft(text);
        const n = parse(text);
        if (n === undefined) {
          setBad(true);
          return;
        }
        setBad(false);
        if (n !== value) onChange(n);
      }}
    />
  );
}
