import type { FileRef } from '@/lib/presets/types';
import { Chip } from '@/ui/components/Chip';

export interface FilesListProps {
  value: FileRef[];
}

/** Display name for a FileRef: "Screenshot", the given name, or the URL's file name / host. */
export function fileRefLabel(ref: FileRef): string {
  if (ref.kind === 'screenshot') return 'Screenshot';
  if (ref.name) return ref.name;
  try {
    const u = new URL(ref.url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch {
    return ref.url;
  }
}

/** Read-only list of files attached to a `files` property. */
export function FilesList({ value }: FilesListProps) {
  if (value.length === 0) return <p class="sc-prop-note">No files</p>;
  return (
    <ul class="sc-files" aria-label="Attached files">
      {value.map((ref, i) => (
        <li key={`${String(i)}-${ref.kind === 'external' ? ref.url : 'screenshot'}`}>
          <Chip icon={ref.kind === 'screenshot' ? 'image' : 'file'} title={ref.kind === 'external' ? ref.url : undefined}>
            {fileRefLabel(ref)}
          </Chip>
        </li>
      ))}
    </ul>
  );
}
