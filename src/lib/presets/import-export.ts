/** JSON export/import of presets (`PresetExportFile` envelope). */
import type { Result } from '@/lib/errors';
import { err, ok } from '@/lib/errors';
import { migratePreset } from './migrate';
import type { Preset, PresetExportFile } from './types';

export const EXPORT_FORMAT = 'sitecatch-presets';
/** Refuse absurdly large files before parsing (sync can't hold more than ~100 KB anyway). */
export const MAX_IMPORT_BYTES = 1024 * 1024;

export function exportPresets(presets: Preset[], now: Date = new Date()): string {
  const file: PresetExportFile = {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    presets,
  };
  return JSON.stringify(file, null, 2);
}

export interface ImportOptions {
  /** Ids already in use (e.g. from `listPresets()`). */
  existingIds?: Iterable<string>;
  /**
   * 'conflicts' (default): new id only when it collides with an existing or
   * earlier imported preset. 'always': every imported preset gets a new id
   * (import as copies). 'never': keep ids (importing overwrites existing presets).
   */
  regenerateIds?: 'conflicts' | 'always' | 'never';
}

function invalid(detail: string, message = 'This file is not a Sitecatch presets export.') {
  return err('validation', message, { detail });
}

export function parseImport(json: string, options: ImportOptions = {}): Result<Preset[]> {
  if (json.length > MAX_IMPORT_BYTES) return invalid('file too large', 'This file is too large to be a presets export.');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return invalid(e instanceof Error ? e.message : 'invalid JSON', "This file isn't valid JSON. Choose a file exported from Sitecatch.");
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return invalid('not an object');
  const file = data as Record<string, unknown>;
  if (file.format !== EXPORT_FORMAT) return invalid(`format: ${String(file.format)}`);
  if (file.version !== 1) {
    return invalid(
      `version: ${String(file.version)}`,
      'This export was made with a different version of Sitecatch. Update the extension and try again.',
    );
  }
  if (!Array.isArray(file.presets)) return invalid('presets is not an array');

  const mode = options.regenerateIds ?? 'conflicts';
  const taken = new Set(options.existingIds ?? []);
  const presets: Preset[] = [];
  for (const [i, raw] of (file.presets as unknown[]).entries()) {
    const migrated = migratePreset(raw);
    if (!migrated.ok) {
      return err('validation', `Preset #${i + 1} in this file is damaged or unsupported: ${migrated.error.message}`, {
        detail: migrated.error.detail,
      });
    }
    let preset = migrated.data;
    if (mode === 'always' || (mode === 'conflicts' && taken.has(preset.id))) {
      preset = { ...preset, id: crypto.randomUUID() };
    }
    taken.add(preset.id);
    presets.push(preset);
  }
  return ok(presets);
}
