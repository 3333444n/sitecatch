/**
 * Remembers the popup's most recent save job for this browser session, so a
 * reopened popup can show an in-flight or failed save for the same page.
 *
 * Popup-local storage item (not in the contract file `src/lib/storage/items.ts`);
 * suggested for promotion to the contract.
 */
import { storage } from 'wxt/utils/storage';
import type { SaveMode } from '@/lib/messaging/protocol';

export interface LastJobRecord {
  jobId: string;
  presetId: string;
  /** URL of the tab that was being saved. */
  url: string;
  mode: SaveMode;
}

export const lastJobItem = storage.defineItem<LastJobRecord | null>('session:popup:lastJob', {
  fallback: null,
});
