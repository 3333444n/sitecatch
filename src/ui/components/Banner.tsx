import type { ComponentChildren } from 'preact';
import type { AppError, AppErrorAction } from '@/lib/errors';
import { Button, IconButton } from './Button';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

const TONE_ICON: Record<BannerTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  error: 'alert',
};

export interface BannerProps {
  tone?: BannerTone;
  title?: ComponentChildren;
  children?: ComponentChildren;
  /** Buttons/links rendered under the message. */
  actions?: ComponentChildren;
  /** Shows a dismiss button. */
  onDismiss?: () => void;
  /**
   * Live-region politeness. Defaults to assertive (`role="alert"`) for
   * warning/error and polite (`role="status"`) otherwise. Pass `false` for
   * static banners that shouldn't be announced.
   */
  live?: boolean;
  class?: string;
}

export function Banner({ tone = 'info', title, children, actions, onDismiss, live = true, class: className }: BannerProps) {
  const role = !live ? undefined : tone === 'error' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div class={cx('sc-banner', `sc-banner--${tone}`, className)} role={role}>
      <span class="sc-banner__icon">
        <Icon name={TONE_ICON[tone]} />
      </span>
      <div class="sc-banner__body">
        {title && <p class="sc-banner__title">{title}</p>}
        {children && <div class="sc-banner__message">{children}</div>}
        {actions && <div class="sc-banner__actions">{actions}</div>}
      </div>
      {onDismiss && <IconButton icon="close" label="Dismiss" size="sm" class="sc-banner__dismiss" onClick={onDismiss} />}
    </div>
  );
}

/** Button labels for each recoverable error action. */
export const ERROR_ACTION_LABELS: Record<AppErrorAction, string> = {
  'open-setup': 'Open setup',
  'reshare-db': 'How to share',
  retry: 'Retry',
  'edit-preset': 'Edit preset',
  'grant-permission': 'Grant access',
};

export interface ErrorBannerProps {
  error: AppError;
  /** Called with `error.action` when its button is clicked. Without it, no button is shown. */
  onAction?: (action: AppErrorAction) => void;
  /** Shows a spinner on the action button (e.g. while retrying). */
  actionLoading?: boolean;
  onDismiss?: () => void;
  /** Optional heading above the message. */
  title?: ComponentChildren;
  /** Show `error.detail` in a collapsed "Details" disclosure (default true). */
  showDetail?: boolean;
  class?: string;
}

/** Renders an `AppError` with its actionable message and recovery button. */
export function ErrorBanner({
  error,
  onAction,
  actionLoading = false,
  onDismiss,
  title,
  showDetail = true,
  class: className,
}: ErrorBannerProps) {
  const { action } = error;
  // Restricted pages are expected (about:, stores…) — calmer tone than a failure.
  const tone: BannerTone = error.code === 'restricted-page' ? 'warning' : 'error';
  return (
    <Banner
      tone={tone}
      title={title}
      onDismiss={onDismiss}
      class={className}
      actions={
        action && onAction ? (
          <Button
            size="sm"
            variant="secondary"
            loading={actionLoading}
            data-action={action}
            onClick={() => {
              onAction(action);
            }}
          >
            {ERROR_ACTION_LABELS[action]}
          </Button>
        ) : undefined
      }
    >
      <p class="sc-banner__text">{error.message}</p>
      {showDetail && error.detail && (
        <details class="sc-banner__details">
          <summary>Details</summary>
          <code>{error.detail}</code>
        </details>
      )}
    </Banner>
  );
}
