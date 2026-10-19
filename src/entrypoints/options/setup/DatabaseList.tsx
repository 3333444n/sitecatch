/**
 * Data sources visible to the token (`ds/list`), with search and refresh.
 * Used by the setup wizard (read-only list) and the "new preset" picker
 * (`onPick`). The empty state explains why a database may be missing.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppError, AppErrorAction } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { DataSourceSummary } from '@/lib/notion/types';
import type { TokenKind } from '@/lib/storage/items';
import { Button, EmptyState, ErrorBanner, ExternalLink, Icon, Skeleton, TextInput } from '@/ui/components';
import { CantSeeDatabase } from './CantSeeDatabase';

export interface DatabaseListProps {
  tokenKind: TokenKind;
  /** When set, each row is a button that picks the data source. */
  onPick?: (ds: DataSourceSummary) => void;
  /** Disables picking (e.g. while the schema loads). */
  busyId?: string | null;
  onErrorAction?: (action: AppErrorAction) => void;
  /** Called after every successful load with the list. */
  onLoaded?: (list: DataSourceSummary[]) => void;
  /** Debounce for the search box (ms). */
  searchDelayMs?: number;
}

export function DatabaseList({
  tokenKind,
  onPick,
  busyId = null,
  onErrorAction,
  onLoaded,
  searchDelayMs = 300,
}: DatabaseListProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DataSourceSummary[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  async function load(q: string) {
    const mine = ++seq.current;
    setLoading(true);
    const res = await sendRequest({ type: 'ds/list', ...(q.trim() ? { query: q.trim() } : {}) });
    if (mine !== seq.current) return;
    setLoading(false);
    if (res.ok) {
      setItems(res.data);
      setError(null);
      onLoadedRef.current?.(res.data);
    } else {
      setError(res.error);
    }
  }

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      void load(query);
      return;
    }
    const t = setTimeout(() => {
      void load(query);
    }, searchDelayMs);
    return () => {
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div class="sco-dblist">
      <div class="sco-dblist__toolbar">
        <div class="sco-search">
          <Icon name="search" class="sco-search__icon" />
          <TextInput
            type="search"
            value={query}
            onChange={setQuery}
            placeholder="Search databases"
            aria-label="Search databases"
            class="sco-search__input"
          />
        </div>
        <Button
          variant="secondary"
          icon="refresh"
          loading={loading && items !== null}
          loadingLabel="Refreshing…"
          onClick={() => {
            void load(query);
          }}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <ErrorBanner
          error={error}
          onAction={(action) => {
            if (action === 'retry') void load(query);
            else onErrorAction?.(action);
          }}
        />
      )}

      {items === null && !error && (
        <div class="sco-dblist__loading" aria-busy="true">
          <span class="sc-visually-hidden">Loading databases…</span>
          <Skeleton variant="rect" height={44} />
          <Skeleton variant="rect" height={44} />
          <Skeleton variant="rect" height={44} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <EmptyState
          icon="database"
          title={query.trim() ? `No databases match “${query.trim()}”` : 'No databases yet'}
          body={<CantSeeDatabase tokenKind={tokenKind} />}
        />
      )}

      {items !== null && items.length > 0 && (
        <>
          <ul class="sco-dblist__items" aria-label="Databases">
            {items.map((ds) => (
              <li key={ds.id} class="sco-dblist__item">
                {onPick ? (
                  <button
                    type="button"
                    class="sco-dblist__pick"
                    disabled={busyId !== null}
                    aria-busy={busyId === ds.id ? 'true' : undefined}
                    onClick={() => {
                      onPick(ds);
                    }}
                  >
                    <DsIcon ds={ds} />
                    <span class="sco-dblist__name">{ds.name}</span>
                    <Icon name="chevron-right" class="sco-dblist__chevron" />
                  </button>
                ) : (
                  <div class="sco-dblist__row">
                    <DsIcon ds={ds} />
                    <span class="sco-dblist__name">{ds.name}</span>
                    {ds.url && (
                      <ExternalLink href={ds.url} class="sco-dblist__open">
                        Open
                      </ExternalLink>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <details class="sco-details">
            <summary>Can’t see your database?</summary>
            <CantSeeDatabase tokenKind={tokenKind} />
          </details>
        </>
      )}
    </div>
  );
}

function DsIcon({ ds }: { ds: DataSourceSummary }) {
  if (ds.icon?.kind === 'emoji') {
    return (
      <span class="sco-dblist__icon" aria-hidden="true">
        {ds.icon.emoji}
      </span>
    );
  }
  if (ds.icon?.kind === 'url') {
    return <img class="sco-dblist__icon sco-dblist__icon--img" src={ds.icon.url} alt="" />;
  }
  return (
    <span class="sco-dblist__icon" aria-hidden="true">
      <Icon name="database" />
    </span>
  );
}
