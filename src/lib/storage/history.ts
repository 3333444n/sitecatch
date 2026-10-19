import type { HistoryEntry } from './items';
import { HISTORY_LIMIT, historyItem } from './items';

/** Adds an entry at the top (replacing an older entry for the same page) and caps the list. */
export async function addHistoryEntry(entry: HistoryEntry): Promise<HistoryEntry[]> {
  const current = await historyItem.getValue();
  const next = [entry, ...current.filter((e) => e.pageId !== entry.pageId)].slice(0, HISTORY_LIMIT);
  await historyItem.setValue(next);
  return next;
}

/** Most recent first. */
export async function listHistory(): Promise<HistoryEntry[]> {
  return historyItem.getValue();
}

export async function clearHistory(): Promise<void> {
  await historyItem.setValue([]);
}
