/**
 * Follows a background save job: listens to storage.session changes
 * (`watchJob`) and polls `job/get` as a fallback, until the job is done or
 * failed. Closing the popup only stops watching — the background owns the job.
 */
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { JobState } from '@/lib/messaging/protocol';
import { watchJob } from '@/lib/storage/jobs';

export function isTerminal(job: JobState): boolean {
  return job.status === 'done' || job.status === 'error';
}

export interface TrackJobOptions {
  /** Poll interval in ms (default 1000). */
  pollMs?: number;
  /** Consecutive failed polls before giving up (default 5). */
  maxPollFailures?: number;
}

/**
 * Calls `onUpdate` with each new job state (the last call has a terminal
 * status) or `onLost` when the job can't be followed. Returns a stop function.
 */
export function trackJob(
  jobId: string,
  onUpdate: (job: JobState) => void,
  onLost: (error: AppError) => void,
  { pollMs = 1000, maxPollFailures = 5 }: TrackJobOptions = {},
): () => void {
  let stopped = false;
  // A function so TS doesn't narrow `stopped` across awaits/callbacks.
  const isStopped = () => stopped;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let lastKey = '';

  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    unwatch();
  };

  const emit = (job: JobState) => {
    if (stopped || job.id !== jobId) return;
    const key = `${job.status}|${job.pageUrl ?? ''}|${job.error?.code ?? ''}`;
    if (key === lastKey) return;
    lastKey = key;
    if (isTerminal(job)) stop();
    onUpdate(job);
  };

  const unwatch = watchJob(jobId, (job) => {
    if (job) emit(job);
  });

  const poll = async () => {
    if (isStopped()) return;
    const res = await sendRequest({ type: 'job/get', jobId });
    if (isStopped()) return;
    if (res.ok) {
      failures = 0;
      emit(res.data);
    } else if (res.error.code === 'not-found' || ++failures >= maxPollFailures) {
      stop();
      onLost(res.error);
      return;
    }
    if (!isStopped()) timer = setTimeout(() => void poll(), pollMs);
  };
  void poll();

  return stop;
}
