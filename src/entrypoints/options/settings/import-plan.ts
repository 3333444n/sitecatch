/** Pure import planning: resolve id conflicts as "replace" or "keep both". */
import type { Preset } from '@/lib/presets/types';

export type ConflictMode = 'replace' | 'keep-both';

export interface ImportPreview {
  presets: Preset[];
  /** Ids in the file that already exist locally. */
  conflicts: Set<string>;
}

export function previewImport(parsed: Preset[], existing: Preset[]): ImportPreview {
  const ids = new Set(existing.map((p) => p.id));
  return { presets: parsed, conflicts: new Set(parsed.filter((p) => ids.has(p.id)).map((p) => p.id)) };
}

/**
 * Presets to write. `replace` keeps ids (overwrites existing presets);
 * `keep-both` gives conflicting presets a new id and marks the name.
 */
export function planImport(
  preview: ImportPreview,
  mode: ConflictMode,
  newId: () => string = () => crypto.randomUUID(),
): Preset[] {
  return preview.presets.map((p) =>
    mode === 'keep-both' && preview.conflicts.has(p.id) ? { ...p, id: newId(), name: `${p.name} (imported)` } : p,
  );
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `sitecatch-presets-${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
