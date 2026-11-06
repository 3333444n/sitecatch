/**
 * Preset schema migrations. Every preset read from storage or an import file
 * goes through `migratePreset` so older shapes are upgraded in one place.
 *
 * To add a version: bump `CURRENT_SCHEMA_VERSION`, add a `vN → vN+1` step to
 * `MIGRATIONS`, and update the `Preset` contract type.
 *
 * v1 → v2: presets gained `connectionId` / `workspaceName` (multiple workspaces).
 * Old presets are unassigned (`null`): they resolve to the only connection
 * when exactly one exists (see `src/background/connections.ts`).
 */
import type { Result } from '@/lib/errors';
import { err, ok } from '@/lib/errors';
import { clonePreset, isPreset } from './guards';
import type { Preset } from './types';

export const CURRENT_SCHEMA_VERSION = 2;

/** `MIGRATIONS[n]` upgrades a raw object from version n to n + 1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  1: (raw) => ({ ...raw, schemaVersion: 2, connectionId: null, workspaceName: null }),
};

export function migratePreset(raw: unknown): Result<Preset> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err('validation', 'This preset is not in a format Sitecatch understands.', {
      detail: 'not an object',
    });
  }
  let current = raw as Record<string, unknown>;
  let version = current.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return err('validation', 'This preset is not in a format Sitecatch understands.', {
      detail: `bad schemaVersion: ${String(version)}`,
    });
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return err(
      'validation',
      'This preset was made with a newer version of Sitecatch. Update the extension and try again.',
      { detail: `schemaVersion ${version} > ${CURRENT_SCHEMA_VERSION}` },
    );
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      return err('validation', 'This preset is from an unsupported older version of Sitecatch.', {
        detail: `no migration from v${version}`,
      });
    }
    current = step(current);
    version += 1;
  }
  if (!isPreset(current)) {
    return err('validation', 'This preset is damaged or incomplete and cannot be used.', {
      detail: 'structural check failed',
    });
  }
  return ok(clonePreset(current));
}
