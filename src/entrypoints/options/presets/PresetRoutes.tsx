/**
 * Route wrappers: load an existing preset + schema (assigning a workspace
 * first when the preset's workspace isn't resolved here), or create one from a
 * picked workspace and database.
 */
import { useEffect, useState } from 'preact/hooks';
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { ConnectionSummary } from '@/lib/messaging/protocol';
import type { DataSourceSchema, DataSourceSummary } from '@/lib/notion/types';
import { createEmptyPreset, getPreset, savePreset } from '@/lib/presets/storage';
import type { Preset } from '@/lib/presets/types';
import { Banner, Button, EmptyState, ErrorBanner, Skeleton } from '@/ui/components';
import { connectionsStatus, presetConnection, workspaceName } from '../lib/connections';
import { navigate } from '../lib/router';
import { DatabaseList } from '../setup/DatabaseList';
import { PresetEditor } from './PresetEditor';
import { WorkspacePicker } from './WorkspacePicker';

function Loading({ label }: { label: string }) {
  return (
    <div class="sco-page" aria-busy="true">
      <span class="sc-visually-hidden">{label}</span>
      <Skeleton variant="text" width={200} height={28} />
      <Skeleton variant="rect" height={120} />
      <Skeleton variant="rect" height={240} />
    </div>
  );
}

function ConnectFirst() {
  return (
    <div class="sco-page">
      <EmptyState
        icon="lock"
        title="Connect Sitecatch to Notion first"
        body="Presets save into your Notion databases, so Sitecatch needs a token before you can pick one."
        action={
          <Button
            variant="primary"
            onClick={() => {
              navigate('/setup');
            }}
          >
            Open setup
          </Button>
        }
      />
    </div>
  );
}

/** Why a preset has no usable workspace here, in plain words. */
export function unresolvedMessage(preset: Pick<Preset, 'connectionId' | 'workspaceName'>): string {
  if (preset.connectionId === null) {
    return 'This preset isn’t linked to a workspace yet. Pick the workspace that holds its database.';
  }
  const name = preset.workspaceName ? `“${preset.workspaceName}”` : 'its';
  return `This preset belongs to the ${name} workspace, which isn’t connected on this device. Connect it in Workspaces, or pick the workspace that holds its database.`;
}

/** Shown instead of the editor when a preset's workspace isn't resolved here. */
function AssignWorkspace({ preset, onAssigned }: { preset: Preset; onAssigned: (p: Preset, s: DataSourceSchema) => void }) {
  const list = connectionsStatus.value?.connections ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  async function pick(c: ConnectionSummary) {
    setBusy(c.id);
    setError(null);
    const s = await sendRequest({ type: 'ds/schema', connectionId: c.id, dataSourceId: preset.dataSourceId, force: true });
    if (!s.ok) {
      setBusy(null);
      setError(
        s.error.code === 'db-not-shared'
          ? {
              ...s.error,
              message: `“${preset.dataSourceName}” isn’t visible in “${workspaceName(c)}”. Pick the workspace that holds it, or check that it’s shared with that token.`,
            }
          : s.error,
      );
      return;
    }
    const saved = await savePreset({ ...preset, connectionId: c.id, workspaceName: c.workspaceName });
    setBusy(null);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    onAssigned(saved.data.preset, s.data);
  }

  return (
    <div class="sco-page">
      <a href="#/presets" class="sco-back">
        ← Presets
      </a>
      <h1>{preset.name}</h1>
      <Banner
        tone="warning"
        title="Pick a workspace for this preset"
        live={false}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigate('/setup');
            }}
          >
            Open Workspaces
          </Button>
        }
      >
        {unresolvedMessage(preset)}
      </Banner>
      {error && <ErrorBanner error={error} />}
      <p class="sco-muted">Database: {preset.dataSourceName}</p>
      <WorkspacePicker connections={list} onPick={(c) => void pick(c)} busyId={busy} />
    </div>
  );
}

export function EditPresetRoute({ id }: { id: string }) {
  const [preset, setPreset] = useState<Preset | null>(null);
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const list = connectionsStatus.value?.connections ?? [];
  const connection = preset ? presetConnection(preset, list) : null;
  const connectionId = connection?.id ?? null;

  useEffect(() => {
    const run = { cancelled: false };
    const stale = () => run.cancelled;
    setError(null);
    void (async () => {
      const p = await getPreset(id);
      if (stale()) return;
      if (!p.ok) {
        setError(p.error);
        return;
      }
      setPreset(p.data);
    })();
    return () => {
      run.cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!preset || connectionId === null) return;
    const run = { cancelled: false };
    setError(null);
    void sendRequest({ type: 'ds/schema', connectionId, dataSourceId: preset.dataSourceId, force: attempt > 0 }).then(
      (s) => {
        if (run.cancelled) return;
        if (s.ok) setSchema(s.data);
        else setError(s.error);
      },
    );
    return () => {
      run.cancelled = true;
    };
  }, [preset?.id, connectionId, attempt]);

  if (error && !preset) {
    return (
      <div class="sco-page">
        <EmptyState
          icon="alert"
          title="Preset not found"
          body={error.message}
          action={
            <Button
              onClick={() => {
                navigate('/presets');
              }}
            >
              Back to presets
            </Button>
          }
        />
      </div>
    );
  }
  if (!preset) return <Loading label="Loading preset…" />;
  if (list.length === 0) return <ConnectFirst />;
  if (!connection) {
    return (
      <AssignWorkspace
        preset={preset}
        onAssigned={(p, s) => {
          setSchema(s);
          setPreset(p);
        }}
      />
    );
  }
  if (error) {
    return (
      <div class="sco-page">
        <a href="#/presets" class="sco-back">
          ← Presets
        </a>
        <h1>{preset.name}</h1>
        <ErrorBanner
          title={`Couldn’t load “${preset.dataSourceName}”`}
          error={error}
          onAction={(a) => {
            if (a === 'retry') setAttempt((n) => n + 1);
            else if (a === 'open-setup' || a === 'reshare-db' || a === 'grant-permission') navigate('/setup');
          }}
        />
        <div class="sc-row">
          <Button
            onClick={() => {
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!schema) return <Loading label="Loading preset…" />;
  return <PresetEditor key={preset.id} preset={preset} schema={schema} connection={connection} />;
}

export function NewPresetRoute() {
  const list = connectionsStatus.value?.connections ?? [];
  const [chosen, setChosen] = useState<ConnectionSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [created, setCreated] = useState<{
    preset: Preset;
    schema: DataSourceSchema;
    connection: ConnectionSummary;
  } | null>(null);
  // One workspace: skip the choice.
  const connection = list.length === 1 ? (list[0] ?? null) : chosen;

  async function pick(c: ConnectionSummary, ds: DataSourceSummary) {
    setBusy(ds.id);
    setError(null);
    const res = await sendRequest({ type: 'ds/schema', connectionId: c.id, dataSourceId: ds.id });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated({ preset: createEmptyPreset(ds, res.data, c), schema: res.data, connection: c });
  }

  if (created) {
    return <PresetEditor preset={created.preset} schema={created.schema} connection={created.connection} isNew />;
  }
  if (connectionsStatus.value && list.length === 0) return <ConnectFirst />;

  return (
    <div class="sco-page">
      <header class="sco-page__header">
        <a href="#/presets" class="sco-back">
          ← Presets
        </a>
        <h1>New preset</h1>
        <p class="sco-muted">
          {connection
            ? 'Pick the database this preset saves into. You’ll choose which properties to fill next.'
            : 'Pick the workspace this preset saves into. You’ll choose its database next.'}
        </p>
      </header>
      {error && <ErrorBanner error={error} />}
      {connection === null ? (
        <WorkspacePicker
          connections={list}
          onPick={(c) => {
            setError(null);
            setChosen(c);
          }}
        />
      ) : (
        <>
          {list.length > 1 && (
            <p class="sco-muted">
              Workspace: <strong>{workspaceName(connection)}</strong>{' '}
              <button
                type="button"
                class="sco-linkbutton"
                onClick={() => {
                  setChosen(null);
                  setError(null);
                }}
              >
                Change
              </button>
            </p>
          )}
          <DatabaseList
            key={connection.id}
            connectionId={connection.id}
            tokenKind={connection.tokenKind}
            onPick={(ds) => void pick(connection, ds)}
            busyId={busy}
            onErrorAction={() => {
              navigate('/setup');
            }}
          />
        </>
      )}
    </div>
  );
}
