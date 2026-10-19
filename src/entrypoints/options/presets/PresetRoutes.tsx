/** Route wrappers: load an existing preset + schema, or create one from a picked database. */
import { useEffect, useState } from 'preact/hooks';
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { DataSourceSchema, DataSourceSummary } from '@/lib/notion/types';
import { createEmptyPreset, getPreset } from '@/lib/presets/storage';
import type { Preset } from '@/lib/presets/types';
import { Button, EmptyState, ErrorBanner, Skeleton } from '@/ui/components';
import { authStatus } from '../lib/auth';
import { navigate } from '../lib/router';
import { DatabaseList } from '../setup/DatabaseList';
import { PresetEditor } from './PresetEditor';

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

export function EditPresetRoute({ id }: { id: string }) {
  const [preset, setPreset] = useState<Preset | null>(null);
  const [schema, setSchema] = useState<DataSourceSchema | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);

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
      const s = await sendRequest({ type: 'ds/schema', dataSourceId: p.data.dataSourceId, force: attempt > 0 });
      if (stale()) return;
      if (s.ok) setSchema(s.data);
      else setError(s.error);
    })();
    return () => {
      run.cancelled = true;
    };
  }, [id, attempt]);

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
  if (error && preset) {
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
  if (!preset || !schema) return <Loading label="Loading preset…" />;
  return <PresetEditor key={preset.id} preset={preset} schema={schema} />;
}

export function NewPresetRoute() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [created, setCreated] = useState<{ preset: Preset; schema: DataSourceSchema } | null>(null);

  async function pick(ds: DataSourceSummary) {
    setBusy(ds.id);
    setError(null);
    const res = await sendRequest({ type: 'ds/schema', dataSourceId: ds.id });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated({ preset: createEmptyPreset(ds, res.data), schema: res.data });
  }

  if (created) return <PresetEditor preset={created.preset} schema={created.schema} isNew />;

  if (authStatus.value && !authStatus.value.hasToken) {
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

  return (
    <div class="sco-page">
      <header class="sco-page__header">
        <a href="#/presets" class="sco-back">
          ← Presets
        </a>
        <h1>New preset</h1>
        <p class="sco-muted">Pick the database this preset saves into. You’ll choose which properties to fill next.</p>
      </header>
      {error && <ErrorBanner error={error} />}
      <DatabaseList
        tokenKind={authStatus.value?.tokenKind ?? 'personal'}
        onPick={(ds) => void pick(ds)}
        busyId={busy}
        onErrorAction={() => {
          navigate('/setup');
        }}
      />
    </div>
  );
}
