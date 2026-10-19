import type { ComponentChildren } from 'preact';
import { cx } from './cx';
import { Icon, isIconName } from './Icon';

export interface EmptyStateProps {
  /** An `IconName` from the kit (e.g. "database"), or any custom node (emoji, svg). */
  icon?: ComponentChildren;
  title: ComponentChildren;
  body?: ComponentChildren;
  /** Usually a Button or ButtonLink. */
  action?: ComponentChildren;
  compact?: boolean;
  class?: string;
}

export function EmptyState({ icon, title, body, action, compact = false, class: className }: EmptyStateProps) {
  return (
    <div class={cx('sc-empty', compact && 'sc-empty--compact', className)}>
      {icon !== undefined && (
        <div class="sc-empty__icon" aria-hidden="true">
          {isIconName(icon) ? <Icon name={icon} size={24} /> : icon}
        </div>
      )}
      <p class="sc-empty__title">{title}</p>
      {body && <div class="sc-empty__body">{body}</div>}
      {action && <div class="sc-empty__action">{action}</div>}
    </div>
  );
}
