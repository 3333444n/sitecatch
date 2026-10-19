/**
 * Popup controller: auth check → preset picker → parallel capture / schema /
 * duplicate check → editable form → background save with live job status.
 * All Notion and capture work happens in the background via `sendRequest()`.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AppError, AppErrorAction } from '@/lib/errors';
import type { CaptureResult } from '@/lib/extract/types';
import { sendRequest } from '@/lib/messaging/client';
import type { JobStatus, SaveMode } from '@/lib/messaging/protocol';
import type { DataSourceSchema, DuplicateMatch } from '@/lib/notion/types';
import { resolveInitialValues } from '@/lib/presets/resolve';
import { listPresets } from '@/lib/presets/storage';
import type { FormValue, FormValues, Preset } from '@/lib/presets/types';
import { validatePreset } from '@/lib/presets/validate';
import { fitsPropertyType, isEmptyFormValue } from '@/lib/presets/values';
import { getLastPresetId, setLastPresetId } from '@/lib/storage/settings';
import { Banner, Button, ErrorBanner, Icon, Skeleton } from '@/ui/components';
import { CaptureForm, isRequiredMapping, isVisibleMapping, propertyFor } from './CaptureForm';
import { DuplicateBanner, sortMatches } from './DuplicateBanner';
import { isTerminal, trackJob } from './job';
import { lastJobItem, type LastJobRecord } from '@/lib/storage/items';
import { closePopup, OPTIONS_ROUTES, openInNewTab, openOptions, requestNotionPermission } from './nav';
import { NoPresets, NoSetup } from './NoSetup';
import { PageHeader } from './PageHeader';
import { PresetPicker } from './PresetPicker';
import { Saved, Saving } from './SaveStatus';

/** After this long, tell the user the save continues without the popup. */
export const SLOW_SAVE_MS = 20_000;

export interface TabInfo {
  id: number | null;
  url: string;
  title: string;
  favIconUrl?: string;
}

type Load<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: AppError }
  /** Not needed (e.g. duplicate detection is off). */
  | { status: 'skipped' };

type Boot =
  | { kind: 'checking' }
  | { kind: 'error'; error: AppError }
  | { kind: 'no-setup'; hasToken: boolean; hostPermission: boolean }
  | { kind: 'no-presets' }
  | { kind: 'ready'; presets: Preset[]; tab: TabInfo };

type SaveState =
  | { kind: 'idle' }
  | {
      kind: 'running';
      jobId: string | null;
      status: JobStatus | 'starting';
      mode: SaveMode;
      /** epoch ms */
      startedAt: number;
      dbName: string;
    }
  | { kind: 'done'; pageUrl?: string; dbName: string; warnings?: string[] }
  | { kind: 'error'; error: AppError; mode: SaveMode };

async function activeTab(): Promise<TabInfo> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return { id: tab?.id ?? null, url: tab?.url ?? '', title: tab?.title ?? '', favIconUrl: tab?.favIconUrl };
  } catch {
    return { id: null, url: '', title: '' };
  }
}

/** URL/title-only capture used when `capture/run` fails, so the page can still be saved. */
function fallbackCapture(tab: TabInfo, error: AppError): CaptureResult {
  return {
    tabId: tab.id ?? -1,
    capturedAt: new Date().toISOString(),
    url: tab.url,
    title: tab.title,
    restricted: true,
    restrictedReason: error.message,
    values: {},
    warnings: [],
  };
}

const LOST_JOB: AppError = {
  code: 'unknown',
  message: 'The save stopped without reporting a result. Check your Notion database, then try again.',
  action: 'retry',
};

export function App() {
  const [boot, setBoot] = useState<Boot>({ kind: 'checking' });
  const [bootNonce, setBootNonce] = useState(0);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [capture, setCapture] = useState<Load<CaptureResult>>({ status: 'loading' });
  const [captureNonce, setCaptureNonce] = useState(0);
  const [schema, setSchema] = useState<Load<DataSourceSchema>>({ status: 'loading' });
  const [schemaNonce, setSchemaNonce] = useState(0);
  const [dup, setDup] = useState<Load<DuplicateMatch[]>>({ status: 'loading' });
  const [dupNonce, setDupNonce] = useState(0);
  const [edits, setEdits] = useState<FormValues>({});
  const [showMissing, setShowMissing] = useState(false);
  const [infoDismissed, setInfoDismissed] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [slow, setSlow] = useState(false);

  const stopTracking = useRef<(() => void) | null>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef<string | null>(null);

  const presets = boot.kind === 'ready' ? boot.presets : [];
  const tab = boot.kind === 'ready' ? boot.tab : null;
  const preset = presets.find((p) => p.id === presetId) ?? null;

  // ---- job tracking ------------------------------------------------------

  function follow(jobId: string, mode: SaveMode, dbName: string, startedAt: number) {
    stopTracking.current?.();
    setSave({ kind: 'running', jobId, status: 'queued', mode, startedAt, dbName });
    stopTracking.current = trackJob(
      jobId,
      (job) => {
        if (job.status === 'done') setSave({ kind: 'done', pageUrl: job.pageUrl, dbName, warnings: job.warnings });
        else if (job.status === 'error') setSave({ kind: 'error', error: job.error ?? LOST_JOB, mode });
        else {
          const status = job.status;
          setSave((s) => (s.kind === 'running' && s.jobId === jobId ? { ...s, status } : s));
        }
      },
      (error) => {
        setSave({ kind: 'error', error, mode });
      },
    );
  }

  // Closing the popup only stops watching; the background keeps saving.
  useEffect(
    () => () => {
      stopTracking.current?.();
    },
    [],
  );

  // ---- boot: auth, presets, tab, last job ----------------------------------

  useEffect(() => {
    let live = true;
    const isLive = () => live;
    setBoot({ kind: 'checking' });
    void (async () => {
      const [auth, list, lastId, tabInfo, lastJob] = await Promise.all([
        sendRequest({ type: 'auth/status' }),
        listPresets().catch((): Preset[] => []),
        getLastPresetId().catch(() => null),
        activeTab(),
        lastJobItem.getValue().catch((): LastJobRecord | null => null),
      ]);
      if (!isLive()) return;
      if (!auth.ok) {
        setBoot({ kind: 'error', error: auth.error });
        return;
      }
      if (!auth.data.hasToken || !auth.data.hostPermission) {
        setBoot({ kind: 'no-setup', hasToken: auth.data.hasToken, hostPermission: auth.data.hostPermission });
        return;
      }
      const first = list[0];
      if (!first) {
        setBoot({ kind: 'no-presets' });
        return;
      }
      const resumable = lastJob && lastJob.url !== '' && lastJob.url === tabInfo.url ? lastJob : null;
      const resumePreset = resumable ? list.find((p) => p.id === resumable.presetId) : undefined;
      const selected = resumePreset ?? list.find((p) => p.id === lastId) ?? first;
      setPresetId(selected.id);
      setBoot({ kind: 'ready', presets: list, tab: tabInfo });

      if (resumable && resumePreset) {
        const res = await sendRequest({ type: 'job/get', jobId: resumable.jobId });
        if (!isLive() || !res.ok) return;
        const job = res.data;
        if (!isTerminal(job)) {
          const startedAt = Date.parse(job.startedAt);
          follow(job.id, resumable.mode, resumePreset.dataSourceName, Number.isNaN(startedAt) ? Date.now() : startedAt);
        } else if (job.status === 'error') {
          setSave({ kind: 'error', error: job.error ?? LOST_JOB, mode: resumable.mode });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [bootNonce]);

  // ---- capture (once per boot; reused across presets) ----------------------

  useEffect(() => {
    if (!tab) return;
    let live = true;
    setCapture({ status: 'loading' });
    if (tab.id === null) {
      setCapture({
        status: 'error',
        error: { code: 'restricted-page', message: 'Sitecatch couldn’t find the current tab.', action: 'retry' },
      });
      return;
    }
    void sendRequest({ type: 'capture/run', tabId: tab.id }).then((res) => {
      if (live) setCapture(res.ok ? { status: 'ok', data: res.data } : { status: 'error', error: res.error });
    });
    return () => {
      live = false;
    };
  }, [tab, captureNonce]);

  const captureData = useMemo<CaptureResult | null>(() => {
    if (capture.status === 'ok') return capture.data;
    if (capture.status === 'error' && tab) return fallbackCapture(tab, capture.error);
    return null;
  }, [capture, tab]);

  // ---- schema per data source ---------------------------------------------

  const dataSourceId = preset?.dataSourceId ?? null;
  useEffect(() => {
    if (!dataSourceId) return;
    let live = true;
    setSchema({ status: 'loading' });
    void sendRequest({ type: 'ds/schema', dataSourceId }).then((res) => {
      if (live) setSchema(res.ok ? { status: 'ok', data: res.data } : { status: 'error', error: res.error });
    });
    return () => {
      live = false;
    };
  }, [dataSourceId, schemaNonce]);

  const schemaData = schema.status === 'ok' ? schema.data : null;
  const issues = useMemo(() => (preset && schemaData ? validatePreset(preset, schemaData) : []), [preset, schemaData]);
  const blockingIssues = issues.filter((i) => i.blocking);
  const infoIssues = issues.filter((i) => !i.blocking);

  // ---- duplicate check ----------------------------------------------------

  const dupUrl = tab?.url || captureData?.url || '';
  const dedupeOn = preset !== null && preset.dedupe.propertyId !== null;
  const dupPresetId = preset?.id ?? null;
  const captureLoading = capture.status === 'loading';
  /** No tab URL yet: wait for the capture's URL. */
  const dupWaiting = !dupUrl && captureLoading;
  useEffect(() => {
    if (!dupPresetId) return;
    if (!dedupeOn) {
      setDup({ status: 'skipped' });
      return;
    }
    if (!dupUrl) {
      setDup(dupWaiting ? { status: 'loading' } : { status: 'skipped' });
      return;
    }
    let live = true;
    setDup({ status: 'loading' });
    void sendRequest({ type: 'dup/check', presetId: dupPresetId, url: dupUrl }).then((res) => {
      if (live) setDup(res.ok ? { status: 'ok', data: res.data.matches } : { status: 'error', error: res.error });
    });
    return () => {
      live = false;
    };
  }, [dupPresetId, dedupeOn, dupUrl, dupWaiting, dupNonce]);

  const matches = dup.status === 'ok' ? sortMatches(dup.data) : [];

  // ---- form values --------------------------------------------------------

  const resolved = useMemo(
    () => (preset && captureData ? resolveInitialValues(preset, captureData) : null),
    [preset, captureData],
  );
  const values = useMemo<FormValues | null>(() => {
    if (!preset || !resolved) return null;
    const out: FormValues = { ...resolved };
    // Keep the user's edits for properties the (new) preset still shows with the same input kind.
    for (const m of preset.mappings) {
      const edit = edits[m.propertyId];
      if (edit && isVisibleMapping(m) && fitsPropertyType(edit, m.propertyType)) out[m.propertyId] = edit;
    }
    return out;
  }, [preset, resolved, edits]);

  const missing = useMemo(() => {
    const set = new Set<string>();
    if (!preset || !values) return set;
    for (const m of preset.mappings) {
      const v = values[m.propertyId];
      if (isRequiredMapping(m) && (!v || isEmptyFormValue(v))) set.add(m.propertyId);
    }
    return set;
  }, [preset, values]);

  const dbName = schemaData?.name || preset?.dataSourceName || 'Notion';

  // Focus the first editable field once the form appears for a preset.
  const formReady = values !== null;
  useEffect(() => {
    if (!formReady || !presetId || focusedFor.current === presetId || save.kind === 'running') return;
    const first = fieldsRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
    if (first) {
      focusedFor.current = presetId;
      first.focus();
    }
  }, [formReady, presetId, save.kind]);

  // ---- saving -------------------------------------------------------------

  const saving = save.kind === 'running';
  let blockedReason: string | null = null;
  if (!captureData) blockedReason = 'Capturing the page…';
  else if (schema.status === 'loading') blockedReason = 'Checking the database…';
  else if (schema.status === 'error') blockedReason = 'Fix the database problem above to save.';
  else if (blockingIssues.length > 0) blockedReason = 'Fix the preset to save.';
  else if (dup.status === 'loading') blockedReason = 'Checking for duplicates…';
  else if (missing.size > 0 && preset) {
    const names = preset.mappings
      .filter((m) => missing.has(m.propertyId))
      .map((m) => propertyFor(m, schemaData).name);
    blockedReason = `Fill in ${names.join(', ')} to save.`;
  }
  const canSave = blockedReason === null && !saving && values !== null;
  const defaultMode: SaveMode = matches.length > 0 ? { kind: 'duplicate' } : { kind: 'create' };

  async function startSave(mode: SaveMode) {
    if (!preset || !captureData || !values || !tab) return;
    const name = dbName;
    stopTracking.current?.();
    setSave({ kind: 'running', jobId: null, status: 'starting', mode, startedAt: Date.now(), dbName: name });
    void setLastPresetId(preset.id).catch(() => undefined);
    const res = await sendRequest({ type: 'save/start', presetId: preset.id, values, capture: captureData, mode });
    if (!res.ok) {
      setSave({ kind: 'error', error: res.error, mode });
      return;
    }
    const record: LastJobRecord = { jobId: res.data.jobId, presetId: preset.id, url: tab.url || captureData.url, mode };
    void lastJobItem.setValue(record).catch(() => undefined);
    follow(res.data.jobId, mode, name, Date.now());
  }

  /** Retry a failed save. For a failed create, re-run the duplicate check first (it may have gone through). */
  async function retrySave(mode: SaveMode) {
    if (!preset || !values) return;
    if (mode.kind === 'create' && dedupeOn && dupUrl) {
      setSave({ kind: 'running', jobId: null, status: 'starting', mode, startedAt: Date.now(), dbName });
      const res = await sendRequest({ type: 'dup/check', presetId: preset.id, url: dupUrl });
      if (res.ok && res.data.matches.length > 0) {
        setDup({ status: 'ok', data: res.data.matches });
        setSave({ kind: 'idle' });
        return;
      }
    }
    await startSave(mode);
  }

  function trySave(mode: SaveMode = defaultMode) {
    if (!canSave) {
      if (missing.size > 0) setShowMissing(true);
      return;
    }
    void startSave(mode);
  }

  // Cmd/Ctrl+Enter saves from anywhere in the popup.
  const trySaveRef = useRef(trySave);
  trySaveRef.current = trySave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        trySaveRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // "Still working…" after SLOW_SAVE_MS.
  const runningSince = save.kind === 'running' ? save.startedAt : null;
  useEffect(() => {
    setSlow(false);
    if (runningSince === null) return;
    const t = setTimeout(
      () => {
        setSlow(true);
      },
      Math.max(0, SLOW_SAVE_MS - (Date.now() - runningSince)),
    );
    return () => {
      clearTimeout(t);
    };
  }, [runningSince]);

  // ---- error actions ------------------------------------------------------

  /** Routes an AppError action. Stays synchronous up to `permissions.request`. */
  function actionHandler(retry: () => void) {
    return (action: AppErrorAction) => {
      switch (action) {
        case 'grant-permission': {
          const request = requestNotionPermission();
          void request.then((granted) => {
            if (granted) retry();
          });
          return;
        }
        case 'open-setup':
        case 'reshare-db':
          void openOptions(OPTIONS_ROUTES.setup);
          return;
        case 'edit-preset':
          void openOptions(preset ? OPTIONS_ROUTES.preset(preset.id) : OPTIONS_ROUTES.presets);
          return;
        case 'retry':
          retry();
          return;
      }
    };
  }

  const reboot = () => {
    setBootNonce((n) => n + 1);
  };

  function onPresetChange(id: string) {
    if (id === presetId) return;
    setPresetId(id);
    setShowMissing(false);
    setInfoDismissed(false);
    if (save.kind === 'error') setSave({ kind: 'idle' });
    void setLastPresetId(id).catch(() => undefined);
  }

  function onFieldChange(propertyId: string, value: FormValue) {
    setEdits((e) => ({ ...e, [propertyId]: value }));
  }

  function resetAfterSave() {
    setSave({ kind: 'idle' });
    setDupNonce((n) => n + 1);
    void lastJobItem.setValue(null).catch(() => undefined);
  }

  // ---- render -------------------------------------------------------------

  if (boot.kind === 'checking') {
    return (
      <main class="sc-popup popup" aria-busy="true">
        <p class="sc-visually-hidden" role="status">
          Loading…
        </p>
        <Skeleton height={28} />
        <Skeleton variant="rect" height={96} />
      </main>
    );
  }
  if (boot.kind === 'error') {
    return (
      <main class="sc-popup popup">
        <ErrorBanner error={boot.error} onAction={actionHandler(reboot)} />
      </main>
    );
  }
  if (boot.kind === 'no-setup') {
    return (
      <main class="sc-popup popup">
        <NoSetup
          hasToken={boot.hasToken}
          hostPermission={boot.hostPermission}
          onGrant={() => {
            const request = requestNotionPermission();
            void request.then((granted) => {
              if (granted) reboot();
            });
          }}
        />
      </main>
    );
  }
  if (boot.kind === 'no-presets' || !preset || !tab) {
    return (
      <main class="sc-popup popup">
        <NoPresets />
      </main>
    );
  }

  const header = (
    <header class="popup-header">
      <span class="popup-brand">Sitecatch</span>
      <PresetPicker presets={presets} value={preset.id} disabled={saving} onChange={onPresetChange} />
    </header>
  );

  if (save.kind === 'running') {
    return (
      <main class="sc-popup popup">
        {header}
        <Saving status={save.status} slow={slow} />
      </main>
    );
  }
  if (save.kind === 'done') {
    return (
      <main class="sc-popup popup">
        {header}
        <Saved dbName={save.dbName} pageUrl={save.pageUrl} warnings={save.warnings} onSaveAnother={resetAfterSave} onClose={closePopup} />
      </main>
    );
  }

  const saveError = save.kind === 'error' ? save : null;
  const captureError = capture.status === 'error' ? capture.error : null;

  return (
    <main class="sc-popup popup">
      {header}
      <p class="sc-visually-hidden" role="status" aria-live="polite">
        {captureLoading ? 'Capturing page…' : ''}
      </p>

      <PageHeader capture={captureData} tabTitle={tab.title} tabUrl={tab.url} tabFavicon={tab.favIconUrl} />

      <div class="popup-banners">
        {saveError && (
          <ErrorBanner
            title="Couldn’t save"
            error={saveError.error}
            onAction={actionHandler(() => void retrySave(saveError.mode))}
            onDismiss={() => {
              setSave({ kind: 'idle' });
              void lastJobItem.setValue(null).catch(() => undefined);
            }}
          />
        )}
        {captureError ? (
          <ErrorBanner
            title="Couldn’t capture this page"
            error={{ ...captureError, action: captureError.action ?? 'retry' }}
            onAction={actionHandler(() => {
              setCaptureNonce((n) => n + 1);
            })}
          />
        ) : (
          captureData?.restricted && (
            <Banner tone="warning" title="Limited capture">
              <p class="sc-banner__text">
                {captureData.restrictedReason ?? 'Sitecatch can’t read this page.'} You can still save its URL and
                title.
              </p>
            </Banner>
          )
        )}
        {schema.status === 'error' && (
          <ErrorBanner
            error={schema.error}
            onAction={actionHandler(() => {
              setSchemaNonce((n) => n + 1);
            })}
          />
        )}
        {blockingIssues.length > 0 && (
          <Banner
            tone="error"
            title="This preset needs fixing"
            actions={
              <Button size="sm" variant="secondary" onClick={() => void openOptions(OPTIONS_ROUTES.preset(preset.id))}>
                Edit preset
              </Button>
            }
          >
            <ul class="popup-issues">
              {blockingIssues.map((i) => (
                <li key={`${i.propertyId}-${i.kind}`}>{i.detail}</li>
              ))}
            </ul>
          </Banner>
        )}
        {infoIssues.length > 0 && !infoDismissed && (
          <Banner
            tone="info"
            live={false}
            onDismiss={() => {
              setInfoDismissed(true);
            }}
          >
            <ul class="popup-issues">
              {infoIssues.map((i) => (
                <li key={`${i.propertyId}-${i.kind}`}>{i.detail}</li>
              ))}
            </ul>
          </Banner>
        )}
        {dup.status === 'error' && (
          <p class="popup-note">
            <Icon name="info" size={12} /> Couldn’t check for duplicates: {dup.error.message}
          </p>
        )}
        {matches.length > 0 && (
          <DuplicateBanner
            matches={matches}
            dbName={dbName}
            disabled={!canSave}
            onUpdate={(pageId) => {
              trySave({ kind: 'update', pageId });
            }}
            onDuplicate={() => {
              trySave({ kind: 'duplicate' });
            }}
            onOpen={(url) => void openInNewTab(url)}
          />
        )}
      </div>

      {captureData?.warnings.map((w) => (
        <p class="popup-note" key={w}>
          <Icon name="info" size={12} /> {w}
        </p>
      ))}

      <form
        class="popup-form"
        aria-label={`Save to ${dbName}`}
        onSubmit={(e) => {
          e.preventDefault();
          trySave();
        }}
      >
        {values ? (
          <CaptureForm
            preset={preset}
            schema={schemaData}
            values={values}
            onChange={onFieldChange}
            missing={missing}
            showMissing={showMissing}
            fieldsRef={fieldsRef}
          />
        ) : (
          <div class="popup-fields" aria-busy="true">
            <Skeleton height={14} width="30%" />
            <Skeleton height={32} />
            <Skeleton height={14} width="40%" />
            <Skeleton height={32} />
          </div>
        )}
        <footer class="popup-footer">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={!canSave}
            aria-describedby={blockedReason ? 'popup-save-reason' : undefined}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {matches.length > 0 ? 'Save as duplicate' : `Save to ${dbName}`}
          </Button>
          {blockedReason ? (
            <p class="popup-footer__hint" id="popup-save-reason">
              {blockedReason}
            </p>
          ) : (
            <p class="popup-footer__hint" aria-hidden="true">
              Ctrl/⌘ + Enter
            </p>
          )}
        </footer>
      </form>
    </main>
  );
}
