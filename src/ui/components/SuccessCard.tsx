import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Button, ButtonLink, IconButton } from './Button';
import { cx } from './cx';
import { Icon } from './Icon';

export interface SuccessCardProps {
  title: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Link for the primary button (e.g. the created Notion page). Omit to hide it. */
  href?: string;
  /** Primary button label (default "Open in Notion"). */
  primaryLabel?: string;
  /** Called when the primary link is clicked (e.g. to close the popup). */
  onPrimaryClick?: () => void;
  secondaryAction?: { label: string; onClick: () => void };
  class?: string;
}

/** Confirmation after a save: check mark, title, "Open in Notion" + a secondary action. */
export function SuccessCard({
  title,
  subtitle,
  href,
  primaryLabel = 'Open in Notion',
  onPrimaryClick,
  secondaryAction,
  class: className,
}: SuccessCardProps) {
  return (
    <div class={cx('sc-success', className)} role="status">
      <div class="sc-success__mark" aria-hidden="true">
        <Icon name="check" size={20} />
      </div>
      <p class="sc-success__title">{title}</p>
      {subtitle && <p class="sc-success__subtitle">{subtitle}</p>}
      {(href ?? secondaryAction) && (
        <div class="sc-success__actions">
          {href && (
            <ButtonLink href={href} variant="primary" icon="external" fullWidth onClick={onPrimaryClick}>
              {primaryLabel}
            </ButtonLink>
          )}
          {secondaryAction && (
            <Button variant="ghost" fullWidth onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface ToastProps {
  /** Toast is rendered only while `open`. */
  open: boolean;
  tone?: 'info' | 'success' | 'error';
  children: ComponentChildren;
  /** Optional inline action (e.g. "Undo", "Open"). */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
  /** Auto-dismiss after ms (default 5000; 0 disables). Errors never auto-dismiss. */
  duration?: number;
  class?: string;
}

/**
 * Transient notification pinned to the bottom of the viewport. Render one at a
 * time; the container is a polite live region so it is announced.
 */
export function Toast({
  open,
  tone = 'info',
  children,
  action,
  onDismiss,
  duration = 5000,
  class: className,
}: ToastProps) {
  useEffect(() => {
    if (!open || duration <= 0 || tone === 'error') return;
    const t = setTimeout(onDismiss, duration);
    return () => {
      clearTimeout(t);
    };
  }, [open, duration, tone, onDismiss]);

  return (
    <div class="sc-toast-region" role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      {open && (
        <div class={cx('sc-toast', `sc-toast--${tone}`, className)}>
          {tone !== 'info' && <Icon name={tone === 'success' ? 'check' : 'alert'} class="sc-toast__icon" />}
          <div class="sc-toast__message">{children}</div>
          {action && (
            <Button size="sm" variant="ghost" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          <IconButton icon="close" label="Dismiss" size="sm" onClick={onDismiss} />
        </div>
      )}
    </div>
  );
}
