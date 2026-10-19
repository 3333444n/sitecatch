import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Icon rendered before the label. */
  icon?: IconName;
}

function buttonClass(
  { variant = 'secondary', size = 'md', fullWidth }: ButtonStyleProps,
  extra?: string,
): string {
  return cx('sc-button', `sc-button--${variant}`, `sc-button--${size}`, fullWidth && 'sc-button--full', extra);
}

export interface ButtonProps
  extends ButtonStyleProps,
    Omit<ButtonHTMLAttributes, 'class' | 'size' | 'icon'> {
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  /** Replaces the label while loading (e.g. "Saving…"). */
  loadingLabel?: string;
  class?: string;
  children?: ComponentChildren;
}

export function Button({
  variant,
  size,
  fullWidth,
  icon,
  loading = false,
  loadingLabel,
  disabled,
  type = 'button',
  class: className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={buttonClass({ variant, size, fullWidth }, cx(loading && 'sc-button--loading', className))}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading ? 'true' : undefined}
    >
      {loading ? <Spinner size="sm" /> : icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes, 'class' | 'size' | 'icon' | 'children'> {
  icon: IconName;
  /** Required accessible name (also used as tooltip). */
  label: string;
  variant?: Exclude<ButtonVariant, 'primary'>;
  size?: ButtonSize;
  class?: string;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  class: className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      class={cx('sc-icon-button', `sc-icon-button--${size}`, `sc-button--${variant}`, className)}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}

export interface ButtonLinkProps
  extends ButtonStyleProps,
    Omit<AnchorHTMLAttributes, 'class' | 'size' | 'icon'> {
  href: string;
  /** Open in a new tab (default true — most links leave the extension UI). */
  external?: boolean;
  class?: string;
  children?: ComponentChildren;
}

/** An anchor styled as a button (e.g. "Open in Notion"). */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  icon,
  external = true,
  class: className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      {...rest}
      class={buttonClass({ variant, size, fullWidth }, className)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {external && <span class="sc-visually-hidden"> (opens in a new tab)</span>}
    </a>
  );
}
