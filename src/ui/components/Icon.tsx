import type { JSX } from 'preact';

/** Small inline icon set (16px grid, stroke = currentColor). Decorative by default. */
export type IconName =
  | 'check'
  | 'close'
  | 'info'
  | 'alert'
  | 'warning'
  | 'external'
  | 'chevron-down'
  | 'chevron-right'
  | 'image'
  | 'plus'
  | 'file'
  | 'database'
  | 'search'
  | 'lock';

const PATHS: Record<IconName, JSX.Element> = {
  check: <path d="M3.5 8.5l3 3 6-7" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4M8 4.9v.1" />
    </>
  ),
  alert: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5v4.25M8 11v.1" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.25l6.25 11H1.75z" />
      <path d="M8 6.5v3M8 11.5v.1" />
    </>
  ),
  external: <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v3.5h-9v-9H6" />,
  'chevron-down': <path d="M4 6l4 4 4-4" />,
  'chevron-right': <path d="M6 4l4 4-4 4" />,
  image: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.75" cy="6.5" r="1.1" />
      <path d="M2.5 11.5l3.5-3 2.5 2 2-1.5 3 2.5" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  file: (
    <>
      <path d="M4 1.75h5l3 3v9.5H4z" />
      <path d="M9 1.75v3h3" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="3.75" rx="5" ry="1.75" />
      <path d="M3 3.75v8.5c0 1 2.25 1.75 5 1.75s5-.75 5-1.75v-8.5M3 8c0 1 2.25 1.75 5 1.75S13 9 13 8" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25l3.25 3.25" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.25 7V5a2.75 2.75 0 015.5 0v2" />
    </>
  ),
};

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PATHS, value);
}

export interface IconProps {
  name: IconName;
  /** Pixel size (default 16). */
  size?: number;
  /** Accessible label. When omitted the icon is hidden from assistive tech. */
  label?: string;
  class?: string;
}

export function Icon({ name, size = 16, label, class: className }: IconProps) {
  return (
    <svg
      class={className ? `sc-icon ${className}` : 'sc-icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
