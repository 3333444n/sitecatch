/** Preset editor (#/presets/:id and the second step of #/presets/new). */
import { useMemo, useState } from 'preact/hooks';
import type { AppError } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { ConnectionSummary } from '@/lib/messaging/protocol';
import type { DataSourceSchema, DataSourceSummary } from '@/lib/notion/types';
import { savePreset } from '@/lib/presets/storage';
import type { Mapping, Preset, PresetIssue } from '@/lib/presets/types';
import { refreshPropertyNames } from '@/lib/presets/validate';
import { Banner, Button, Card, ErrorBanner, Field, Select, TextInput, Toast, Toggle } from '@/ui/components';
import { connectionsStatus, workspaceName } from '../lib/connections';
import { navigate, useUnsavedChangesGuard } from '../lib/router';
import { DatabaseList } from '../setup/DatabaseList';
import {
  dedupeCandidates,
  editorIssues,
  filesProperties,
  missingMappings,
  normalizeForSave,
  pruneToSchema,
  readOnlyProperties,
  removeMapping,
  setScreenshotProperty,
  upsertMapping,
  writableProperties,
} from './editor-model';
import { PropertyRow } from './PropertyRow';
import { WorkspacePicker } from './WorkspacePicker';

export interface PresetEditorProps {
  preset: Preset;
  schema: DataSourceSchema;
  /** The workspace the preset resolves to here (reads its schema with this token). */
  connection: ConnectionSummary;
  /** Not saved yet (created from "New preset"). */
  isNew?: boolean;
}

const READ_ONLY_REASON: Record<string, string> = {
  people: 'People can’t be set by Sitecatch',
  formula: 'Computed by Notion',
  rollup: 'Computed by Notion',
  created_time: 'Set by Notion',
  created_by: 'Set by Notion',
  last_edited_time: 'Set by Notion',
  last_edited_by: 'Set by Notion',
  unique_id: 'Set by Notion',
  verification: 'Not writable through the API',
  button: 'Not a value',
  unsupported: 'Not supported by Sitecatch yet',
};

export function PresetEditor({
  preset: initial,
  schema: initialSchema,
  connection: initialConnection,
  isNew = false,
}: PresetEditorProps) {
  const [saved, setSaved] = useState<Preset | null>(isNew ? null : initial);
  const [draft, setDraft] = useState<Preset>(initial);
  const [schema, setSchema] = useState<DataSourceSchema>(initialSchema);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);
  const [nearQuota, setNearQuota] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [changingDb, setChangingDb] = useState(false);
  const [dbBusy, setDbBusy] = useState<string | null>(null);
  const [dbError, setDbError] = useState<AppError | null>(null);
  const [connection, setConnection] = useState<ConnectionSummary>(initialConnection);
  /** While changing the database: the workspace whose databases are listed. */
  const [browseConnection, setBrowseConnection] = useState<ConnectionSummary>(initialConnection);
  const [pickingWorkspace, setPickingWorkspace] = useState(false);
  const allConnections = connectionsStatus.value?.connections ?? [];

  const dirty = saved === null || JSON.stringify(saved) !== JSON.stringify(draft);
  useUnsavedChangesGuard(dirty);

  const issues = useMemo(() => editorIssues(draft, schema), [draft, schema]);
  const blocking = issues.filter((i) => i.blocking);
  const notices = issues.filter((i) => !i.blocking);
  const issuesFor = (id: string): PresetIssue[] => issues.filter((i) => i.propertyId === id);

  const props = writableProperties(schema);
  const readOnly = readOnlyProperties(schema);
  const files = filesProperties(schema);
  const dedupe = dedupeCandidates(schema);
  const missing = missingMappings(draft, schema);
  const mappingFor = (id: string): Mapping | undefined => draft.mappings.find((m) => m.propertyId === id);

  function update(fn: (p: Preset) => Preset) {
    setDraft((p) => fn(p));
    setSaveError(null);
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    // Pin the workspace explicitly (an unassigned preset resolved to the only one).
    const pinned: Preset = { ...draft, connectionId: connection.id, workspaceName: connection.workspaceName };
    const toSave = normalizeForSave(refreshPropertyNames(pinned, schema));
    const res = await savePreset(toSave);
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    setSaved(res.data.preset);
    setDraft(res.data.preset);
    setNearQuota(res.data.nearQuota);
    setToast('Preset saved');
    if (isNew) navigate(`/presets/${encodeURIComponent(res.data.preset.id)}`, { replace: true });
  }

  async function pickDatabase(ds: DataSourceSummary) {
    setDbBusy(ds.id);
    setDbError(null);
    const target = browseConnection;
    const res = await sendRequest({ type: 'ds/schema', connectionId: target.id, dataSourceId: ds.id, force: true });
    setDbBusy(null);
    if (!res.ok) {
      setDbError(res.error);
      return;
    }
    setSchema(res.data);
    setConnection(target);
    update((p) => ({
      ...p,
      connectionId: target.id,
      workspaceName: target.workspaceName,
      dataSourceId: ds.id,
      dataSourceName: res.data.name || ds.name,
    }));
    setChangingDb(false);
    setPickingWorkspace(false);
  }

  return (
    <div class="sco-page sco-editor">
      <header class="sco-page__header sco-editor__header">
        <div>
          <a href="#/presets" class="sco-back">
            ← Presets
          </a>
          <h1>{isNew ? 'New preset' : draft.name.trim() || 'Untitled preset'}</h1>
        </div>
      </header>

      <Card title="Basics" headingLevel={2}>
        <div class="sc-stack">
          <Field label="Name" required hint="Shown in the popup’s preset picker.">
            <TextInput
              value={draft.name}
              onChange={(v) => {
                update((p) => ({ ...p, name: v }));
              }}
            />
          </Field>
          <Field label="Workspace" group>
            <div class="sco-db-row">
              <span class="sco-db-row__name">{workspaceName(connection)}</span>
              {allConnections.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={pickingWorkspace ? 'true' : 'false'}
                  aria-label="Change workspace"
                  onClick={() => {
                    setPickingWorkspace(!pickingWorkspace);
                    setChangingDb(false);
                  }}
                >
                  {pickingWorkspace ? 'Cancel' : 'Change'}
                </Button>
              )}
            </div>
          </Field>
          {pickingWorkspace && (
            <div class="sco-db-change">
              <p class="sco-muted">
                Pick the workspace, then a database in it. Each workspace uses its own token.
              </p>
              <WorkspacePicker
                connections={allConnections}
                currentId={connection.id}
                onPick={(c) => {
                  setBrowseConnection(c);
                  setPickingWorkspace(false);
                  setDbError(null);
                  setChangingDb(true);
                }}
              />
            </div>
          )}
          <Field label="Database" group>
            <div class="sco-db-row">
              <span class="sco-db-row__name">{draft.dataSourceName}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={changingDb ? 'true' : 'false'}
                aria-label={changingDb ? 'Cancel changing database' : 'Change database'}
                onClick={() => {
                  if (!changingDb) setBrowseConnection(connection);
                  setChangingDb(!changingDb);
                  setPickingWorkspace(false);
                }}
              >
                {changingDb ? 'Cancel' : 'Change'}
              </Button>
            </div>
          </Field>
          {changingDb && (
            <div class="sco-db-change">
              <p class="sco-muted">
                Pick another database
                {browseConnection.id !== connection.id ? ` in “${workspaceName(browseConnection)}”` : ''}. Mappings are
                kept by property id, so properties that don’t exist there will be flagged below.
              </p>
              {dbError && <ErrorBanner error={dbError} />}
              <DatabaseList
                key={browseConnection.id}
                connectionId={browseConnection.id}
                tokenKind={browseConnection.tokenKind}
                onPick={(ds) => void pickDatabase(ds)}
                busyId={dbBusy}
              />
            </div>
          )}
        </div>
      </Card>

      <ValidationBanner
        blocking={blocking}
        notices={notices}
        onPrune={
          missing.length > 0 || blocking.some((i) => i.kind === 'missing' && i.propertyId !== '')
            ? () => {
                update((p) => pruneToSchema(p, schema));
              }
            : undefined
        }
      />

      <Card
        title="Properties"
        headingLevel={2}
        description="Turn on the properties Sitecatch should fill. Others are left untouched."
      >
        <ul class="sco-props" aria-label="Properties">
          {props.map((prop) => (
            <PropertyRow
              key={prop.id}
              property={prop}
              mapping={mappingFor(prop.id)}
              issues={issuesFor(prop.id)}
              isScreenshotTarget={draft.screenshot.filesPropertyId === prop.id}
              onChange={(m) => {
                update((p) => (m === null ? removeMapping(p, prop.id) : upsertMapping(p, m)));
              }}
              onUseAsScreenshotTarget={
                prop.type === 'files'
                  ? () => {
                      update((p) => setScreenshotProperty(p, prop.id));
                    }
                  : undefined
              }
            />
          ))}
        </ul>

        {missing.length > 0 && (
          <div class="sco-missing">
            <h3 class="sco-subheading">Not in this database</h3>
            <ul class="sco-props">
              {missing.map((m) => (
                <li key={m.propertyId} class="sco-prop sco-prop--invalid">
                  <div class="sco-prop__head">
                    <span class="sco-prop__name">{m.propertyName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        update((p) => removeMapping(p, m.propertyId));
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {readOnly.length > 0 && (
          <div class="sco-readonly">
            <h3 class="sco-subheading">Can’t be filled by Sitecatch</h3>
            <ul class="sco-readonly__list">
              {readOnly.map((p) => (
                <li key={p.id} class="sco-readonly__item">
                  <span>{p.name}</span>
                  <span class="sco-muted">{READ_ONLY_REASON[p.type] ?? 'Read-only'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Screenshot, cover and icon" headingLevel={2}>
        <div class="sc-stack">
          <Field
            label="Attach screenshot to"
            hint={
              files.length === 0
                ? 'This database has no Files & media property. Add one in Notion to store the screenshot as a file.'
                : 'The visible part of the page, uploaded once and reused for the cover and body image.'
            }
          >
            <Select
              options={files.map((f) => ({ value: f.id, label: f.name }))}
              value={draft.screenshot.filesPropertyId}
              placeholder="Don’t attach"
              onChange={(v) => {
                update((p) => setScreenshotProperty(p, v));
              }}
            />
          </Field>
          <Field label="Page cover">
            <Select
              options={[
                { value: 'none', label: 'No cover' },
                { value: 'screenshot', label: 'Screenshot' },
                { value: 'ogImage', label: 'Open Graph image (og:image)' },
              ]}
              value={draft.cover}
              onChange={(v) => {
                if (v === 'none' || v === 'screenshot' || v === 'ogImage') update((p) => ({ ...p, cover: v }));
              }}
            />
          </Field>
          <Toggle
            label="Add screenshot to the page body"
            description="Appends the screenshot as an image block. New pages only, never on update."
            checked={draft.screenshot.bodyImage}
            onChange={(on) => {
              update((p) => ({ ...p, screenshot: { ...p.screenshot, bodyImage: on } }));
            }}
          />
          <Field label="Page icon">
            <Select
              options={[
                { value: 'none', label: 'No icon' },
                { value: 'favicon', label: 'Site favicon' },
              ]}
              value={draft.icon}
              onChange={(v) => {
                if (v === 'none' || v === 'favicon') update((p) => ({ ...p, icon: v }));
              }}
            />
          </Field>
        </div>
      </Card>

      <Card title="Duplicate detection" headingLevel={2}>
        <Field
          label="Compare page URL with"
          hint="Before saving, Sitecatch looks for a page whose property matches the page URL (ignoring tracking parameters) and offers to update it instead."
        >
          <Select
            options={dedupe.map((p) => ({ value: p.id, label: p.name }))}
            value={draft.dedupe.propertyId}
            placeholder="Off"
            onChange={(v) => {
              update((p) => ({ ...p, dedupe: { propertyId: v } }));
            }}
          />
        </Field>
      </Card>

      {saveError && <ErrorBanner error={saveError} onAction={(a) => { if (a === 'retry') void onSave(); }} />}
      {nearQuota && !dirty && (
        <Banner tone="warning" title="This preset is close to the sync size limit">
          Browsers sync at most 8 KB per preset. Remove a few mappings or shorten fixed values to stay below it.
        </Banner>
      )}

      <div class="sco-savebar">
        <span class="sco-muted" aria-live="polite">
          {blocking.length > 0
            ? `Fix ${String(blocking.length)} issue${blocking.length === 1 ? '' : 's'} to save`
            : dirty
              ? 'Unsaved changes'
              : 'All changes saved'}
        </span>
        <div class="sc-row">
          {saved && dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(saved);
              }}
            >
              Discard changes
            </Button>
          )}
          <Button variant="primary" loading={saving} loadingLabel="Saving…" disabled={blocking.length > 0 || !dirty} onClick={() => void onSave()}>
            Save preset
          </Button>
        </div>
      </div>

      <Toast
        open={toast !== null}
        tone="success"
        onDismiss={() => {
          setToast(null);
        }}
      >
        {toast}
      </Toast>
    </div>
  );
}

function ValidationBanner({
  blocking,
  notices,
  onPrune,
}: {
  blocking: PresetIssue[];
  notices: PresetIssue[];
  onPrune?: () => void;
}) {
  if (blocking.length === 0 && notices.length === 0) return null;
  return (
    <div class="sco-validation" data-testid="validation">
      {blocking.length > 0 && (
        <Banner
          tone="error"
          title="Fix these before saving"
          actions={
            onPrune ? (
              <Button size="sm" onClick={onPrune}>
                Remove what’s missing
              </Button>
            ) : undefined
          }
        >
          <ul class="sco-issue-list">
            {blocking.map((i) => (
              <li key={i.propertyId + i.detail}>{i.detail}</li>
            ))}
          </ul>
        </Banner>
      )}
      {notices.length > 0 && (
        <Banner tone="info" title="Good to know" live={false}>
          <ul class="sco-issue-list">
            {notices.map((i) => (
              <li key={i.propertyId + i.detail}>{i.detail}</li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}
