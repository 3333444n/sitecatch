import type { ComponentChildren } from 'preact';
import { IconButton } from '@/ui/components';
import { openSettings } from './nav';

export interface PopupHeaderProps {
  /** Middle slot, usually the preset picker. It flexes; the settings button stays fixed size. */
  children?: ComponentChildren;
}

/** Top row of every popup state: wordmark, optional preset picker, settings button (never disabled). */
export function PopupHeader({ children }: PopupHeaderProps) {
  return (
    <header class="popup-header">
      <span class="popup-brand">Sitecatch</span>
      {children}
      <IconButton
        icon="settings"
        label="Open Sitecatch settings"
        tooltip="Settings"
        class="popup-header__settings"
        onClick={() => void openSettings()}
      />
    </header>
  );
}
