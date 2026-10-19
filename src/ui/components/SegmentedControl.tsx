import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { cx } from './cx';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ComponentChildren;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  /** Currently selected value. */
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the radio group. */
  label: string;
  size?: 'sm' | 'md';
  class?: string;
}

/**
 * A row of mutually exclusive choices with radio-group semantics: one tab stop
 * (the selected segment), ←/→/↑/↓ move and select, Home/End jump to the ends.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  class: className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const enabled = options.filter((o) => !o.disabled);
  // If nothing is selected (or the selection is disabled), the first enabled segment takes the tab stop.
  const tabStop = enabled.some((o) => o.value === value) ? value : enabled[0]?.value;

  function select(next: T) {
    onChange(next);
    const buttons = groupRef.current?.querySelectorAll<HTMLElement>('[data-segment]') ?? [];
    for (const el of buttons) if (el.dataset.segment === next) el.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((o) => o.value === value);
    let next: SegmentedOption<T> | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(idx + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next.value);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      class={cx('sc-segmented', `sc-segmented--${size}`, className)}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-segment={o.value}
            aria-checked={checked ? 'true' : 'false'}
            tabIndex={o.value === tabStop ? 0 : -1}
            disabled={o.disabled}
            class={cx('sc-segmented__item', checked && 'sc-segmented__item--on')}
            onClick={() => {
              if (!checked) onChange(o.value);
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
