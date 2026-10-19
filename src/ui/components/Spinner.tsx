import { cx } from './cx';

export interface SpinnerProps {
  /** 'sm' = 12px, 'md' = 16px (default), 'lg' = 24px. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Accessible label. When set, the spinner is announced as a status;
   * when omitted it is purely decorative (e.g. inside a busy button).
   */
  label?: string;
  class?: string;
}

export function Spinner({ size = 'md', label, class: className }: SpinnerProps) {
  return (
    <span
      class={cx('sc-spinner', `sc-spinner--${size}`, className)}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {label && <span class="sc-visually-hidden">{label}</span>}
    </span>
  );
}
