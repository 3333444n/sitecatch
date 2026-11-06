/** The full background handler table. */
import type { Handlers } from '@/lib/messaging/protocol';
import { createClientProvider, type BackgroundDeps } from '../context';
import { createCaptureHandlers } from './capture';
import { createConnectionHandlers } from './connections';
import { createDataSourceHandlers } from './dataSources';
import { createDuplicateHandlers } from './duplicates';
import { createJobHandlers } from './jobs';
import { createPageHandlers } from './pages';
import { createSaveHandlers } from './save';

export function createHandlers(deps: BackgroundDeps): Handlers {
  const clients = createClientProvider(deps);
  return {
    ...createConnectionHandlers(deps, clients),
    ...createDataSourceHandlers(deps, clients),
    ...createPageHandlers(deps, clients),
    ...createCaptureHandlers(deps),
    ...createDuplicateHandlers(deps, clients),
    ...createSaveHandlers(deps, clients),
    ...createJobHandlers(),
  };
}
