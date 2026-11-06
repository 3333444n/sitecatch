/** Settings (#/settings): capture, workspaces summary, import/export, sync note, recent saves. */
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '@/lib/storage/settings';
import { historyItem, type HistoryEntry, type Settings } from '@/lib/storage/items';
import { Banner, Button, Card, ExternalLink } from '@/ui/components';
import { connectionsStatus, TOKEN_KIND_LABEL, workspaceName } from '../lib/connections';
import { navigate } from '../lib/router';
import { ImportExport } from './ImportExport';

export function SettingsPage() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    void getSettings().then(setLocal);
    void historyItem.getValue().then(setHistory);
  }, []);

  function change(patch: Partial<Settings>) {
    setLocal((s) => (s ? { ...s, ...patch } : s));
    void setSettings(patch).then(setLocal);
  }

  const status = connectionsStatus.value;
  const list = status?.connections ?? [];

  return (
    <div class="sco-page">
      <header class="sco-page__header">
        <h1>Settings</h1>
      </header>

      <Card title="Capture" headingLevel={2}>
        {settings && (
          <div class="sc-stack">
            <RangeField
              id="sco-delay"
              label="Wait before taking the screenshot"
              hint="Extra time after the page finishes loading, for sites that animate in or load content late."
              min={0}
              max={10}
              step={0.5}
              value={settings.captureDelayMs / 1000}
              format={(v) => (v === 0 ? 'No delay' : `${String(v)} s`)}
              onChange={(v) => {
                change({ captureDelayMs: Math.round(v * 1000) });
              }}
            />
            <RangeField
              id="sco-quality"
              label="Screenshot quality (JPEG)"
              hint="Higher looks sharper but makes bigger files. Sitecatch shrinks screenshots that exceed Notion’s upload limit."
              min={0.5}
              max={1}
              step={0.05}
              value={settings.jpegQuality}
              format={(v) => `${String(Math.round(v * 100))}%`}
              onChange={(v) => {
                change({ jpegQuality: v });
              }}
            />
          </div>
        )}
      </Card>

      <Card
        title="Notion workspaces"
        headingLevel={2}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigate('/setup');
            }}
          >
            {list.length > 0 ? 'Manage workspaces' : 'Open setup'}
          </Button>
        }
      >
        {list.length > 0 ? (
          <div class="sco-account">
            <dl class="sco-dl">
              {list.map((c) => (
                <Fragment key={c.id}>
                  <dt>{list.length === 1 ? 'Workspace' : workspaceName(c)}</dt>
                  <dd>
                    {list.length === 1 ? `${workspaceName(c)} · ` : ''}
                    {TOKEN_KIND_LABEL[c.tokenKind]} · as {c.botName}
                  </dd>
                </Fragment>
              ))}
              <dt>Access to api.notion.com</dt>
              <dd>{status?.hostPermission ? 'Granted' : 'Not granted: open Workspaces to allow it'}</dd>
            </dl>
          </div>
        ) : (
          <p class="sco-muted">Not connected. Open setup to connect Sitecatch to Notion.</p>
        )}
      </Card>

      <ImportExport />

      <Banner tone="info" title="Presets sync with your browser account" live={false}>
        Presets are stored in your browser’s sync storage. In Firefox they follow you when you’re signed in to a Mozilla
        account with add-on sync turned on; in Chrome, when sync is on for your profile. Otherwise they stay on this
        device. Tokens never sync: they stay on this device only, so on another device you connect each workspace again.
      </Banner>

      {history.length > 0 && (
        <Card title="Recent saves" headingLevel={2}>
          <ul class="sco-history">
            {history.map((h) => (
              <li key={h.pageId + h.savedAt}>
                <ExternalLink href={h.pageUrl}>{h.title || h.sourceUrl}</ExternalLink>{' '}
                <span class="sco-muted">
                  · {h.presetName} · {new Date(h.savedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

interface RangeFieldProps {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function RangeField({ id, label, hint, min, max, step, value, format, onChange }: RangeFieldProps) {
  return (
    <div class="sc-field">
      <div class="sc-field__label-row">
        <label for={id} class="sc-field__label">
          {label}
        </label>
        <output for={id} class="sc-field__aside">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        class="sco-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        aria-describedby={`${id}-hint`}
        onInput={(e) => {
          onChange(Number(e.currentTarget.value));
        }}
      />
      <p id={`${id}-hint`} class="sc-field__hint">
        {hint}
      </p>
    </div>
  );
}
