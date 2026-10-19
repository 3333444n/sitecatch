import type { ComponentChildren } from 'preact';
import { cx } from './cx';

export interface CardProps {
  title?: ComponentChildren;
  description?: ComponentChildren;
  /** Elements on the right of the header (buttons, badges). */
  actions?: ComponentChildren;
  footer?: ComponentChildren;
  /** Tighter padding for the popup. */
  compact?: boolean;
  /** Heading level for `title` (default 3). */
  headingLevel?: 2 | 3 | 4;
  class?: string;
  children?: ComponentChildren;
}

export function Card({
  title,
  description,
  actions,
  footer,
  compact = false,
  headingLevel = 3,
  class: className,
  children,
}: CardProps) {
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4';
  const hasHeader = Boolean(title ?? description ?? actions);
  return (
    <section class={cx('sc-card', compact && 'sc-card--compact', className)}>
      {hasHeader && (
        <header class="sc-card__header">
          <div class="sc-card__heading">
            {title && <Heading class="sc-card__title">{title}</Heading>}
            {description && <p class="sc-card__description">{description}</p>}
          </div>
          {actions && <div class="sc-card__actions">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div class="sc-card__body">{children}</div>}
      {footer && <footer class="sc-card__footer">{footer}</footer>}
    </section>
  );
}
