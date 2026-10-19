import { useEffect, useState } from 'preact/hooks';
import { Checkbox } from '@/ui/components/Checkbox';
import { cx } from '@/ui/components/cx';
import { useFieldControl } from '@/ui/components/Field';

export type DateValue = { start: string; end?: string } | null;

export interface DateInputProps {
  value: DateValue;
  onChange: (value: DateValue) => void;
  disabled?: boolean;
  /** Offer the "Include time" switch (default true). */
  allowTime?: boolean;
  id?: string;
}

function hasTime(start: string | undefined): boolean {
  return Boolean(start && /T\d{2}:\d{2}/.test(start));
}

/**
 * Date (and optional time) for a Notion `date` property. Emits ISO strings:
 * `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` (local wall time, no offset) with time.
 * An existing `end` is preserved; editing ranges is out of scope for v0.
 */
export function DateInput({ value, onChange, disabled = false, allowTime = true, id }: DateInputProps) {
  const field = useFieldControl(id);
  const [withTime, setWithTime] = useState(hasTime(value?.start));

  useEffect(() => {
    if (hasTime(value?.start)) setWithTime(true);
  }, [value?.start]);

  const start = value?.start ?? '';
  const display = withTime ? (hasTime(start) ? start.slice(0, 16) : start ? `${start.slice(0, 10)}T00:00` : '') : start.slice(0, 10);

  function emit(nextStart: string) {
    if (nextStart === '') {
      onChange(null);
      return;
    }
    onChange(value?.end !== undefined ? { start: nextStart, end: value.end } : { start: nextStart });
  }

  return (
    <div class="sc-date">
      <input
        id={field.id}
        type={withTime ? 'datetime-local' : 'date'}
        class={cx('sc-input', 'sc-date__input')}
        value={display}
        disabled={disabled}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid ? 'true' : undefined}
        aria-required={field.required ? 'true' : undefined}
        onInput={(e) => {
          emit(e.currentTarget.value);
        }}
      />
      {allowTime && (
        <Checkbox
          id={`${field.id}-time`}
          class="sc-date__time"
          label="Include time"
          checked={withTime}
          disabled={disabled}
          onChange={(on) => {
            setWithTime(on);
            if (!start) return;
            emit(on ? (hasTime(start) ? start.slice(0, 16) : `${start.slice(0, 10)}T00:00`) : start.slice(0, 10));
          }}
        />
      )}
    </div>
  );
}
