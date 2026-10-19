/** Save jobs in storage.session so their status survives the popup closing. */
import type { Result } from '@/lib/errors';
import { err, ok } from '@/lib/errors';
import type { JobState } from '@/lib/messaging/protocol';
import { jobItem } from './items';

export async function createJob(
  init: { presetName?: string } = {},
  now: Date = new Date(),
): Promise<JobState> {
  const job: JobState = {
    id: crypto.randomUUID(),
    status: 'queued',
    startedAt: now.toISOString(),
    ...(init.presetName !== undefined ? { presetName: init.presetName } : {}),
  };
  await jobItem(job.id).setValue(job);
  return job;
}

/** Merges `patch` into the job. Returns the updated job, or null if it doesn't exist. */
export async function updateJob(
  id: string,
  patch: Partial<Omit<JobState, 'id' | 'startedAt'>>,
): Promise<JobState | null> {
  const item = jobItem(id);
  const current = await item.getValue();
  if (!current) return null;
  const next: JobState = { ...current, ...patch, id: current.id, startedAt: current.startedAt };
  await item.setValue(next);
  return next;
}

export async function getJob(id: string): Promise<Result<JobState>> {
  const job = await jobItem(id).getValue();
  if (!job) {
    return err('not-found', "This save is no longer tracked. Check your Notion database to see if it was saved.", {
      detail: `job ${id}`,
    });
  }
  return ok(job);
}

/** Calls `cb` on every change of the job (null when removed). Returns unwatch. */
export function watchJob(id: string, cb: (job: JobState | null) => void): () => void {
  return jobItem(id).watch((value) => {
    cb(value);
  });
}
