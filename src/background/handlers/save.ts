/**
 * `save/start`: creates the job, replies `{ jobId }` right away, then runs the
 * save pipeline detached from the request (it keeps going if the popup closes).
 */
import { err, ok } from '@/lib/errors';
import type { Handler } from '@/lib/messaging/protocol';
import { getPreset } from '@/lib/presets/storage';
import { addHistoryEntry } from '@/lib/storage/history';
import { createJob, updateJob } from '@/lib/storage/jobs';
import { setLastPresetId } from '@/lib/storage/settings';
import type { BackgroundDeps, ClientProvider } from '../context';
import { runSavePipeline, type SavePipelineDeps } from '../save-pipeline';
import { getSchema } from '../schema-cache';

export function createPipelineDeps(deps: BackgroundDeps, clients: ClientProvider): SavePipelineDeps {
  return {
    requireClient: clients.requireClient,
    loadPreset: getPreset,
    fetchSchema: (client, dataSourceId) =>
      getSchema(client, dataSourceId, { force: true, now: deps.now().getTime() }),
    updateJob,
    addHistory: addHistoryEntry,
    setLastPresetId,
    compress: (dataUrl, options) => deps.compress(dataUrl, options),
    badge: deps.badge,
    now: () => deps.now(),
    sleep: (ms) => deps.sleep(ms),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Messages cross a structured-clone boundary: check the shape before trusting it. */
function isValidRequest(request: unknown): boolean {
  if (!isObject(request)) return false;
  const { presetId, values, capture, mode } = request;
  if (typeof presetId !== 'string' || !isObject(values) || !isObject(capture) || !isObject(mode)) {
    return false;
  }
  return (
    mode.kind === 'create' ||
    mode.kind === 'duplicate' ||
    (mode.kind === 'update' && typeof mode.pageId === 'string' && mode.pageId !== '')
  );
}

export function createSaveHandlers(deps: BackgroundDeps, clients: ClientProvider) {
  const pipelineDeps = createPipelineDeps(deps, clients);

  const start: Handler<'save/start'> = async (request) => {
    if (!isValidRequest(request)) {
      return err('validation', 'Sitecatch couldn’t start the save. Reopen the popup and try again.', {
        action: 'retry',
        detail: 'malformed save/start request',
      });
    }
    const preset = await getPreset(request.presetId);
    if (!preset.ok) return preset;
    const job = await createJob({ presetName: preset.data.name }, deps.now());
    const { presetId, values, capture, mode } = request;
    deps.runDetached(() => runSavePipeline(job.id, { presetId, values, capture, mode }, pipelineDeps));
    return ok({ jobId: job.id });
  };

  return { 'save/start': start };
}
