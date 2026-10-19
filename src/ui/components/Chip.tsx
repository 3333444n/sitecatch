import type { ComponentChildren } from 'preact';
import type { NotionColor } from '@/lib/notion/types';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export const NOTION_COLORS: readonly NotionColor[] = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

/** Class for a Notion option color; unknown/missing colors fall back to `default`. */
export function notionColorClass(color: NotionColor | undefined): string {
  const c = color && NOTION_COLORS.includes(color) ? color : 'default';
  return `sc-chip--${c}`;
}

export interface ChipProps {
  children: ComponentChildren;
  /** Notion option color (select / multi_select / status). */
  color?: NotionColor;
  icon?: IconName;
  /** Shows a remove (×) button; the button's label is "Remove {removeLabel}". */
  onRemove?: () => void;
  /** Text used in the remove button's accessible name (defaults to children when it is a string). */
  removeLabel?: string;
  disabled?: boolean;
  /** Plain Notion-style rounded rectangle (default) or pill (status). */
  shape?: 'rect' | 'pill';
  title?: string;
  class?: string;
}

/** A Notion-colored option chip (select/multi_select/status values). */
export function Chip({
  children,
  color,
  icon,
  onRemove,
  removeLabel,
  disabled = false,
  shape = 'rect',
  title,
  class: className,
}: ChipProps) {
  const name = removeLabel ?? (typeof children === 'string' ? children : 'item');
  return (
    <span class={cx('sc-chip', notionColorClass(color), shape === 'pill' && 'sc-chip--pill', className)} title={title}>
      {icon && <Icon name={icon} size={12} />}
      <span class="sc-chip__label">{children}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          class="sc-chip__remove"
          aria-label={`Remove ${name}`}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={onRemove}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ComponentChildren;
  class?: string;
}

/** Small status label (e.g. "Default", "Needs fix", "Connected"). */
export function Badge({ tone = 'neutral', children, class: className }: BadgeProps) {
  return <span class={cx('sc-badge', `sc-badge--${tone}`, className)}>{children}</span>;
}
