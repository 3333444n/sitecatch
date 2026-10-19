import type { AnchorHTMLAttributes, ComponentChildren } from 'preact';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ExternalLinkProps extends Omit<AnchorHTMLAttributes, 'class' | 'target' | 'rel'> {
  href: string;
  /** Show the ↗ glyph after the text (default true). */
  showIcon?: boolean;
  class?: string;
  children?: ComponentChildren;
}

/** A link that always opens in a new tab, safely (noopener), and says so to screen readers. */
export function ExternalLink({ href, showIcon = true, class: className, children, ...rest }: ExternalLinkProps) {
  return (
    <a {...rest} href={href} class={cx('sc-link', className)} target="_blank" rel="noopener noreferrer">
      {children}
      {showIcon && <Icon name="external" size={12} class="sc-link__icon" />}
      <span class="sc-visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
