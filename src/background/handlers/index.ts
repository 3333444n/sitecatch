/** The full background handler table. */
import type { Handlers } from '@/lib/messaging/protocol';
import { createClientProvider, type BackgroundDeps } from '../context';
import { createAuthHandlers } from './auth';
import { createCaptureHandlers } from './capture';
import { createDataSourceHandlers } from './dataSources';
import { createDuplicateHandlers } from './duplicates';
import { createJobHandlers } from './jobs';
import { createSaveHandlers } from './save';

export function createHandlers(deps: BackgroundDeps): Handlers {
  const clients = createClientProvider(deps);
  return {
    ...createAuthHandlers(deps, clients),
    ...createDataSourceHandlers(deps, clients),
    ...createCaptureHandlers(deps),
    ...createDuplicateHandlers(deps, clients),
    ...createSaveHandlers(deps, clients),
    ...createJobHandlers(),
  };
}
