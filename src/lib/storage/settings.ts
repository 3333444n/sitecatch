import type { Settings } from './items';
import { DEFAULT_SETTINGS, lastPresetIdItem, settingsItem } from './items';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Fills missing keys with defaults and clamps out-of-range values. */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    captureDelayMs: Number.isFinite(merged.captureDelayMs)
      ? clamp(Math.round(merged.captureDelayMs), 0, 10_000)
      : DEFAULT_SETTINGS.captureDelayMs,
    jpegQuality: Number.isFinite(merged.jpegQuality)
      ? clamp(merged.jpegQuality, 0.1, 1)
      : DEFAULT_SETTINGS.jpegQuality,
  };
}

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

/** Merges `patch` into the stored settings and returns the result. */
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await settingsItem.setValue(next);
  return next;
}

export function watchSettings(cb: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => {
    cb(normalizeSettings(value));
  });
}

export async function getLastPresetId(): Promise<string | null> {
  return lastPresetIdItem.getValue();
}

export async function setLastPresetId(id: string | null): Promise<void> {
  await lastPresetIdItem.setValue(id);
}
