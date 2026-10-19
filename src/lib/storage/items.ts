/**
 * CONTRACT FILE — shared across all modules. Change only via the orchestrator.
 *
 * All persisted state, defined with WXT's typed storage items.
 *   local:   device-only (token, settings, history) — the token NEVER goes to sync.
 *   sync:    presets (one item per preset to stay under the 8 KB/item quota) + index.
 *   session: in-memory per browser session (save jobs, schema cache).
 */
import { storage } from 'wxt/utils/storage';
import type { DataSourceSchema } from '@/lib/notion/types';
import type { JobState } from '@/lib/messaging/protocol';
import type { Preset } from '@/lib/presets/types';

export interface AuthState {
  /** Notion internal integration secret. Never log, never send anywhere but api.notion.com. */
  token: string;
  botName: string;
  workspaceName: string | null;
  /**
   * Workspace single-file upload limit in bytes (`bot.workspace_limits`, e.g.
   * 5 MiB on free plans), when Notion reports it. The save pipeline sizes
   * screenshots to fit it.
   */
  maxFileUploadBytes?: number;
  /** ISO 8601. */
  validatedAt: string;
}

export interface Settings {
  /** Extra wait after document.readyState === 'complete' before capturing. */
  captureDelayMs: number;
  /** JPEG quality for screenshots, 0..1. */
  jpegQuality: number;
}

export const DEFAULT_SETTINGS: Settings = {
  captureDelayMs: 0,
  jpegQuality: 0.85,
};

export interface HistoryEntry {
  pageId: string;
  pageUrl: string;
  /** Title saved to Notion. */
  title: string;
  /** Source website URL. */
  sourceUrl: string;
  presetId: string;
  presetName: string;
  /** ISO 8601. */
  savedAt: string;
}

export const HISTORY_LIMIT = 20;

export interface CachedSchema {
  schema: DataSourceSchema;
  /** epoch ms */
  fetchedAt: number;
}

export const authItem = storage.defineItem<AuthState | null>('local:auth', { fallback: null });

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const lastPresetIdItem = storage.defineItem<string | null>('local:lastPresetId', {
  fallback: null,
});

/** Most recent first, capped at HISTORY_LIMIT. */
export const historyItem = storage.defineItem<HistoryEntry[]>('local:history', { fallback: [] });

/** Ordered list of preset ids (display order). */
export const presetIndexItem = storage.defineItem<string[]>('sync:presetIndex', { fallback: [] });

/** `sync:preset:<id>` */
export function presetItem(id: string) {
  return storage.defineItem<Preset | null>(`sync:preset:${id}`, { fallback: null });
}

/** `session:job:<id>` */
export function jobItem(id: string) {
  return storage.defineItem<JobState | null>(`session:job:${id}`, { fallback: null });
}

/** `session:schema:<dataSourceId>` */
export function schemaCacheItem(dataSourceId: string) {
  return storage.defineItem<CachedSchema | null>(`session:schema:${dataSourceId}`, {
    fallback: null,
  });
}
