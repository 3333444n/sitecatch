/** Presets list (#/presets): status per preset, reorder, duplicate, delete. */
import { useEffect, useState } from 'preact/hooks';
import { sendRequest } from '@/lib/messaging/client';
import type { DataSourceSchema } from '@/lib/notion/types';
import { clonePreset } from '@/lib/presets/guards';
import { deletePreset, listPresets, reorderPresets, savePreset, watchPresets } from '@/lib/presets/storage';
import type { Preset } from '@/lib/presets/types';
import type { AppError } from '@/lib/errors';
import { Badge, Button, EmptyState, ErrorBanner, IconButton, Skeleton, type BadgeTone } from '@/ui/components';
import { authStatus } from '../lib/auth';
import { navigate } from '../lib/router';
import { editorIssues } from './editor-model';

type SchemaState = { status: 'loading' } | { status: 'ok'; schema: DataSourceSchema } | { status: 'error'; error: AppError };

export interface PresetStatus {
  tone: BadgeTone;
  label: string;
  detail?: string;
}

export function presetStatus(preset: Preset, state: SchemaState | undefined): PresetStatus {
  if (!state || state.status === 'loading') return { tone: 'neutral', label: 'Checking…' };
  if (state.status === 'error') {
    return {
      tone: 'danger',
      label: state.error.code === 'db-not-shared' ? 'Database not shared' : 'Can’t check',
      detail: state.error.message,
    };
  }
  const issues = editorIssues(preset, state.schema);
  const blocking = issues.filter((i) => i.blocking);
  if (blocking.length > 0) return { tone: 'danger', label: 'Needs fix', detail: blocking.map((i) => i.detail).join(' ') };
  if (issues.length > 0) return { tone: 'warning', label: 'Ready, with notes', detail: issues.map((i) => i.detail).join(' ') };
  return { tone: 'success', label: 'Ready' };
}

export function PresetsList() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [schemas, setSchemas] = useState<Record<string, SchemaState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    void listPresets().then(setPresets);
    return watchPresets(setPresets);
  }, []);

  const connected = authStatus.value?.hasToken === true;
  const dsIds = [...new Set((presets ?? []).map((p) => p.dataSourceId))].sort().join('|');
  useEffect(() => {
    if (!presets || !connected) return;
    for (const dsId of new Set(presets.map((p) => p.dataSourceId))) {
      if (schemas[dsId]) continue;
      setSchemas((s) => ({ ...s, [dsId]: { status: 'loading' } }));
      void sendRequest({ type: 'ds/schema', dataSourceId: dsId }).then((res) => {
        setSchemas((s) => ({
          ...s,
          [dsId]: res.ok ? { status: 'ok', schema: res.data } : { status: 'error', error: res.error },
        }));
      });
    }
  }, [dsIds, connected]);

  async function move(index: number, delta: -1 | 1) {
    if (!presets) return;
    const ids = presets.map((p) => p.id);
    const j = index + delta;
    const a = ids[index];
    const b = ids[j];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[j] = a;
    // Optimistic: reorder locally, storage watcher confirms.
    setPresets(ids.map((id) => presets.find((p) => p.id === id)).filter((p): p is Preset => p !== undefined));
    await reorderPresets(ids);
  }

  async function duplicate(p: Preset) {
    const copy: Preset = { ...clonePreset(p), id: crypto.randomUUID(), name: `${p.name} (copy)` };
    const res = await savePreset(copy);
    if (!res.ok) setError(res.error);
  }

  async function remove(id: string) {
    setConfirmDelete(null);
    await deletePreset(id);
  }

  return (
    <div class="sco-page">
      <header class="sco-page__header sco-page__header--row">
        <div>
          <h1>Presets</h1>
          <p class="sco-muted">A preset says which database to save into and where each property’s value comes from.</p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => {
            navigate('/presets/new');
          }}
        >
          New preset
        </Button>
      </header>

      {error && <ErrorBanner error={error} onDismiss={() => { setError(null); }} />}

      {presets === null && (
        <div aria-busy="true" class="sc-stack">
          <Skeleton variant="rect" height={72} />
          <Skeleton variant="rect" height={72} />
        </div>
      )}

      {presets !== null && presets.length === 0 && (
        <EmptyState
          icon="database"
          title="No presets yet"
          body={
            connected
              ? 'Create one for each kind of thing you save, like “Resources” or “Fav websites”.'
              : 'Connect Sitecatch to Notion first, then create a preset for each database you save into.'
          }
          action={
            connected ? (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  navigate('/presets/new');
                }}
              >
                Create your first preset
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  navigate('/setup');
                }}
              >
                Open setup
              </Button>
            )
          }
        />
      )}

      {presets !== null && presets.length > 0 && (
        <ol class="sco-preset-list" aria-label="Presets">
          {presets.map((p, i) => {
            const status = connected ? presetStatus(p, schemas[p.dataSourceId]) : { tone: 'neutral' as const, label: 'Not connected' };
            const count = p.mappings.length;
            return (
              <li key={p.id} class="sco-preset">
                <a class="sco-preset__main" href={`#/presets/${encodeURIComponent(p.id)}`}>
                  <span class="sco-preset__name">{p.name}</span>
                  <span class="sco-preset__meta">
                    {p.dataSourceName} · {count} {count === 1 ? 'property' : 'properties'}
                    {p.screenshot.filesPropertyId ? ' + screenshot' : ''}
                  </span>
                </a>
                <span title={'detail' in status ? status.detail : undefined}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </span>
                <div class="sco-preset__actions">
                  <IconButton
                    icon="chevron-down"
                    class="sco-flip"
                    label={`Move ${p.name} up`}
                    size="sm"
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`Move ${p.name} down`}
                    size="sm"
                    disabled={i === presets.length - 1}
                    onClick={() => void move(i, 1)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => void duplicate(p)} aria-label={`Duplicate ${p.name}`}>
                    Duplicate
                  </Button>
                  {confirmDelete === p.id ? (
                    <span class="sco-confirm" role="group" aria-label={`Confirm deleting ${p.name}`}>
                      <Button size="sm" variant="danger" onClick={() => void remove(p.id)}>
                        Delete “{p.name}”
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setConfirmDelete(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        setConfirmDelete(p.id);
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
