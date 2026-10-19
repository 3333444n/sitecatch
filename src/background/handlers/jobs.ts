/** `job/get`: current state of a background save. */
import { err } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { getJob } from '@/lib/storage/jobs';

export function createJobHandlers() {
  const get: Handler<'job/get'> = async (request) => {
    if (typeof request.jobId !== 'string' || request.jobId === '') {
      return err('not-found', 'This save is no longer tracked.', { detail: 'missing jobId' });
    }
    return getJob(request.jobId);
  };
  return { 'job/get': get };
}
