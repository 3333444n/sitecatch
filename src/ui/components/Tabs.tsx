import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { cx } from './cx';

export interface TabItem {
  id: string;
  label: ComponentChildren;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Id of the selected tab. */
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Content of the selected tab's panel. */
  children?: ComponentChildren;
  class?: string;
}

/**
 * ARIA tabs with automatic activation: ←/→ (and Home/End) move between tabs
 * and select them. Render the selected tab's content as children.
 */
export function Tabs({ items, value, onChange, label, children, class: className }: TabsProps) {
  const base = `sc-tabs-${useId()}`;
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((t) => !t.disabled);

  function focusTab(id: string) {
    onChange(id);
    const tabs = listRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [];
    for (const el of tabs) if (el.dataset.tabId === id) el.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const idx = enabled.findIndex((t) => t.id === value);
    let next: TabItem | undefined;
    if (e.key === 'ArrowRight') next = enabled[(idx + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    focusTab(next.id);
  }

  return (
    <div class={cx('sc-tabs', className)}>
      <div class="sc-tabs__list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
        {items.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              data-tab-id={tab.id}
              aria-selected={selected ? 'true' : 'false'}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              class={cx('sc-tabs__tab', selected && 'sc-tabs__tab--selected')}
              onClick={() => {
                onChange(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        class="sc-tabs__panel"
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
