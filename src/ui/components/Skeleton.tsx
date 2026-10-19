import { cx } from './cx';

export interface SkeletonProps {
  /** 'text' = one line of text height, 'rect' = block, 'circle' = round avatar/icon. */
  variant?: 'text' | 'rect' | 'circle';
  /** CSS width (number = px). Defaults to 100%. */
  width?: number | string;
  /** CSS height (number = px). Defaults depend on the variant. */
  height?: number | string;
  /** Render several text lines; the last one is shorter. */
  lines?: number;
  class?: string;
}

function px(v: number | string | undefined): string | undefined {
  return typeof v === 'number' ? `${String(v)}px` : v;
}

/** Loading placeholder. Decorative: wrap the loading region in aria-busy for AT. */
export function Skeleton({ variant = 'text', width, height, lines = 1, class: className }: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <span class={cx('sc-skeleton-lines', className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            class="sc-skeleton sc-skeleton--text"
            style={{ width: i === lines - 1 ? '60%' : px(width) ?? '100%' }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      class={cx('sc-skeleton', `sc-skeleton--${variant}`, className)}
      style={{ width: px(width), height: px(height) }}
      aria-hidden="true"
    />
  );
}
