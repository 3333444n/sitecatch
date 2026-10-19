import { Button, EmptyState } from '@/ui/components';
import { OPTIONS_ROUTES, openOptions } from './nav';

export interface NoSetupProps {
  hasToken: boolean;
  hostPermission: boolean;
  /** Called from the click handler; must call `permissions.request` synchronously. */
  onGrant: () => void;
}

/** Shown until Sitecatch has a token and access to api.notion.com. */
export function NoSetup({ hasToken, hostPermission, onGrant }: NoSetupProps) {
  const onlyPermission = hasToken && !hostPermission;
  return (
    <EmptyState
      icon="lock"
      title="Connect Sitecatch to Notion"
      body={
        onlyPermission
          ? 'Sitecatch needs access to api.notion.com to save pages. Grant access to continue.'
          : 'Connect Sitecatch to Notion to start saving. Setup takes about two minutes.'
      }
      action={
        <div class="popup-actions">
          {onlyPermission && (
            <Button variant="primary" onClick={onGrant}>
              Grant access
            </Button>
          )}
          <Button
            variant={onlyPermission ? 'secondary' : 'primary'}
            onClick={() => void openOptions(OPTIONS_ROUTES.setup)}
          >
            Open setup
          </Button>
        </div>
      }
    />
  );
}

export function NoPresets() {
  return (
    <EmptyState
      icon="database"
      title="Create your first preset"
      body="A preset says which Notion database to save to and how to fill its properties."
      action={
        <Button variant="primary" icon="plus" onClick={() => void openOptions(OPTIONS_ROUTES.presets)}>
          Create a preset
        </Button>
      }
    />
  );
}
