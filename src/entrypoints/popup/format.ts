/** Small, pure display helpers for the popup. */
import type { FormValue } from '@/lib/presets/types';
import { fileRefLabel } from '@/ui/property-inputs/FilesList';

/** "just now", "5 minutes ago", "yesterday", "3 days ago", or a date for older times. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'some time ago';
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${new Date(then).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

/** Hostname without a leading "www.", or '' when the URL can't be parsed. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatDate(start: string): string {
  // Date-only values stay as typed; date-times are shown in local time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const t = Date.parse(start);
  return Number.isNaN(t) ? start : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** One-line, human-readable rendering of a form value ('' when empty). */
export function summarizeValue(value: FormValue): string {
  switch (value.kind) {
    case 'text':
      return value.value.trim();
    case 'number':
      return value.value === null ? '' : String(value.value);
    case 'checkbox':
      return value.value ? 'Yes' : 'No';
    case 'select':
      return value.value ?? '';
    case 'multi_select':
      return value.value.join(', ');
    case 'date':
      if (!value.value) return '';
      return value.value.end
        ? `${formatDate(value.value.start)} → ${formatDate(value.value.end)}`
        : formatDate(value.value.start);
    case 'files':
      return value.value.map(fileRefLabel).join(', ');
  }
}
