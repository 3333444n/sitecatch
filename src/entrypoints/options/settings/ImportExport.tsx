/** Export presets as JSON / import them with conflict handling. */
import { useRef, useState } from 'preact/hooks';
import type { AppError } from '@/lib/errors';
import { exportPresets, parseImport } from '@/lib/presets/import-export';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { Banner, Button, Card, ErrorBanner } from '@/ui/components';
import { exportFileName, planImport, previewImport, type ConflictMode, type ImportPreview } from './import-plan';

export function downloadText(text: string, fileName: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function ImportExport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ConflictMode>('keep-both');
  const [error, setError] = useState<AppError | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setResult(null);
    const presets = await listPresets();
    downloadText(exportPresets(presets), exportFileName());
    setResult(`Exported ${String(presets.length)} preset${presets.length === 1 ? '' : 's'}.`);
  }

  async function onFile(file: File | undefined) {
    setError(null);
    setResult(null);
    setPreview(null);
    if (!file) return;
    const text = await file.text();
    // Keep ids so we can detect conflicts and let the user choose.
    const parsed = parseImport(text, { regenerateIds: 'never' });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.data.length === 0) {
      setError({ code: 'validation', message: 'This file contains no presets.' });
      return;
    }
    setPreview(previewImport(parsed.data, await listPresets()));
  }

  async function onConfirm() {
    if (!preview) return;
    setBusy(true);
    const toWrite = planImport(preview, mode);
    const failed: string[] = [];
    for (const p of toWrite) {
      const res = await savePreset(p);
      if (!res.ok) failed.push(`${p.name}: ${res.error.message}`);
    }
    setBusy(false);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    const okCount = toWrite.length - failed.length;
    setResult(`Imported ${String(okCount)} preset${okCount === 1 ? '' : 's'}.`);
    if (failed.length > 0) setError({ code: 'validation', message: `Some presets couldn’t be imported. ${failed.join(' ')}` });
  }

  return (
    <Card
      title="Import and export presets"
      headingLevel={2}
      description="Back up your presets or move them to another browser. Files contain presets only: never your token, settings or history."
    >
      <div class="sc-stack">
        <div class="sc-row sco-wrap">
          <Button onClick={() => void onExport()}>Export presets</Button>
          <label class="sc-button sc-button--secondary sc-button--md sco-file">
            Import presets…
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              class="sc-visually-hidden"
              data-testid="import-file"
              onChange={(e) => void onFile(e.currentTarget.files?.[0])}
            />
          </label>
        </div>

        {error && <ErrorBanner error={error} onDismiss={() => { setError(null); }} />}
        {result && !preview && <Banner tone="success">{result}</Banner>}

        {preview && (
          <div class="sco-import" role="region" aria-label="Import preview">
            <p>
              <strong>
                {preview.presets.length} preset{preview.presets.length === 1 ? '' : 's'}
              </strong>{' '}
              in this file:
            </p>
            <ul class="sco-import__list">
              {preview.presets.map((p) => (
                <li key={p.id}>
                  {p.name} <span class="sco-muted">→ {p.dataSourceName}</span>
                  {preview.conflicts.has(p.id) && <span class="sco-import__conflict"> · already exists</span>}
                </li>
              ))}
            </ul>
            {preview.conflicts.size > 0 && (
              <fieldset class="sco-radio-group">
                <legend>
                  {preview.conflicts.size} preset{preview.conflicts.size === 1 ? ' already exists' : 's already exist'}. What
                  should happen?
                </legend>
                <label class="sco-radio">
                  <input
                    type="radio"
                    name="sco-conflict"
                    checked={mode === 'keep-both'}
                    onChange={() => {
                      setMode('keep-both');
                    }}
                  />
                  Keep both (imported copies are added as new presets)
                </label>
                <label class="sco-radio">
                  <input
                    type="radio"
                    name="sco-conflict"
                    checked={mode === 'replace'}
                    onChange={() => {
                      setMode('replace');
                    }}
                  />
                  Replace the existing presets
                </label>
              </fieldset>
            )}
            <p class="sco-muted">
              Presets pointing to databases your token can’t see import fine and show “Needs fix” until you change the
              database.
            </p>
            <div class="sc-row">
              <Button variant="primary" loading={busy} loadingLabel="Importing…" onClick={() => void onConfirm()}>
                Import {preview.presets.length} preset{preview.presets.length === 1 ? '' : 's'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
