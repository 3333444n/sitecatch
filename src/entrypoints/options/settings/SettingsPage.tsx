/** Settings (#/settings): capture, account, import/export, sync note, recent saves. */
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '@/lib/storage/settings';
import { historyItem, type HistoryEntry, type Settings } from '@/lib/storage/items';
import { Banner, Button, Card, ExternalLink } from '@/ui/components';
import { authStatus, disconnect, TOKEN_KIND_LABEL } from '../lib/auth';
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

  const status = authStatus.value;

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
        title="Notion account"
        headingLevel={2}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigate('/setup');
            }}
          >
            {status?.hasToken ? 'Re-run setup' : 'Open setup'}
          </Button>
        }
      >
        {status?.hasToken ? (
          <div class="sco-account">
            <dl class="sco-dl">
              <dt>Workspace</dt>
              <dd>{status.workspaceName ?? 'Unknown'}</dd>
              <dt>Connected with</dt>
              <dd>{TOKEN_KIND_LABEL[status.tokenKind ?? 'personal']}</dd>
              <dt>Access to api.notion.com</dt>
              <dd>{status.hostPermission ? 'Granted' : 'Not granted: open setup to allow it'}</dd>
            </dl>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm('Disconnect Sitecatch from Notion? Your presets stay on this device.')) void disconnect();
              }}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <p class="sco-muted">Not connected. Open setup to connect Sitecatch to Notion.</p>
        )}
      </Card>

      <ImportExport />

      <Banner tone="info" title="Presets sync with your browser account" live={false}>
        Presets are stored in your browser’s sync storage. In Firefox they follow you when you’re signed in to a Mozilla
        account with add-on sync turned on; in Chrome, when sync is on for your profile. Otherwise they stay on this
        device. Your token never syncs: it stays on this device only.
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
