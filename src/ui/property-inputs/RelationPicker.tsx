import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppError, Result } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { PageOption } from '@/lib/notion/types';
import type { RelationRef } from '@/lib/presets/types';
import { Button } from '@/ui/components/Button';
import { Chip } from '@/ui/components/Chip';
import { cx } from '@/ui/components/cx';
import { useFieldControl } from '@/ui/components/Field';
import { Icon } from '@/ui/components/Icon';
import { Spinner } from '@/ui/components/Spinner';

/** Searches the pages of a data source (defaults to the background's `pages/search`). */
export type PageSearch = (dataSourceId: string, query: string) => Promise<Result<PageOption[]>>;

export const defaultPageSearch: PageSearch = (dataSourceId, query) =>
  sendRequest({ type: 'pages/search', dataSourceId, query: query || undefined });

export const RELATION_SEARCH_DEBOUNCE_MS = 250;

export interface RelationPickerProps {
  /** Data source the relation points to; undefined when the schema doesn't say (search is unavailable). */
  dataSourceId: string | undefined;
  /** Linked pages, in order. */
  value: RelationRef[];
  onChange: (value: RelationRef[]) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  /** Accessible name for the results list. */
  listLabel?: string;
  /** Injected for tests. */
  search?: PageSearch;
  debounceMs?: number;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ok'; query: string; options: PageOption[] }
  | { status: 'error'; query: string; error: AppError };

function iconText(option: PageOption): string | null {
  return option.icon?.kind === 'emoji' ? option.icon.emoji : null;
}

/**
 * Searchable page picker for relation properties. Type to search the related
 * database (debounced, server-side), ↑/↓ to move, Enter to link or unlink the
 * highlighted page, Backspace on an empty input removes the last page, Esc
 * closes the list.
 */
export function RelationPicker({
  dataSourceId,
  value,
  onChange,
  disabled = false,
  placeholder = 'Search pages to link',
  id,
  listLabel = 'Pages',
  search = defaultPageSearch,
  debounceMs = RELATION_SEARCH_DEBOUNCE_MS,
}: RelationPickerProps) {
  const field = useFieldControl(id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [retryNonce, setRetryNonce] = useState(0);
  const fetchedOnce = useRef(false);
  const seq = useRef(0);
  const listId = `${field.id}-listbox`;
  const statusId = `${field.id}-status`;
  const unavailable = dataSourceId === undefined;
  const trimmed = query.trim();

  useEffect(() => {
    if (!open || dataSourceId === undefined) return;
    const target = dataSourceId;
    const mySeq = ++seq.current;
    const delay = fetchedOnce.current ? debounceMs : 0;
    const timer = setTimeout(() => {
      fetchedOnce.current = true;
      setState({ status: 'loading', query: trimmed });
      void search(target, trimmed).then(
        (res) => {
          if (mySeq !== seq.current) return;
          setState(
            res.ok
              ? { status: 'ok', query: trimmed, options: res.data }
              : { status: 'error', query: trimmed, error: res.error },
          );
          setActive(0);
        },
        () => {
          if (mySeq !== seq.current) return;
          setState({
            status: 'error',
            query: trimmed,
            error: { code: 'unknown', message: 'Couldn’t search Notion. Try again.', action: 'retry' },
          });
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
    };
    // `search` is left out on purpose: callers pass inline functions, and a new identity must not refetch.
  }, [open, trimmed, dataSourceId, retryNonce, debounceMs]);

  const options = state.status === 'ok' ? state.options : [];
  const selectedIds = new Set(value.map((r) => r.id));
  const activeIndex = options.length === 0 ? -1 : Math.min(active, options.length - 1);
  const activeId = open && activeIndex >= 0 ? `${listId}-${String(activeIndex)}` : undefined;

  function toggle(option: PageOption) {
    if (selectedIds.has(option.id)) {
      onChange(value.filter((r) => r.id !== option.id));
    } else {
      onChange([...value, { id: option.id, title: option.title }]);
    }
  }

  function remove(pageId: string) {
    onChange(value.filter((r) => r.id !== pageId));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    if (unavailable && e.key !== 'Backspace') return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        else if (options.length > 0) setActive((activeIndex + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) setOpen(true);
        else if (options.length > 0) setActive((activeIndex - 1 + options.length) % options.length);
        break;
      case 'Enter': {
        if (e.ctrlKey || e.metaKey) return; // let Ctrl/⌘+Enter reach the form (save)
        e.preventDefault();
        if (!open) {
          setOpen(true);
          break;
        }
        const option = options[activeIndex];
        if (option) toggle(option);
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        break;
      case 'Backspace': {
        const last = value[value.length - 1];
        if (query === '' && last) remove(last.id);
        break;
      }
      default:
        break;
    }
  }

  let statusText: string | null = null;
  if (unavailable) {
    // Explained under the control instead (the list never opens).
  } else if (state.status === 'loading' || (state.status === 'idle' && open)) {
    statusText = 'Searching…';
  } else if (state.status === 'ok' && options.length === 0) {
    statusText = state.query
      ? `No pages match “${state.query}”. Try another word from the page title.`
      : 'The linked database has no pages yet.';
  } else if (state.status === 'ok') {
    statusText = options.length === 1 ? '1 page found' : `${String(options.length)} pages found`;
  }

  return (
    <div class={cx('sc-picker', 'sc-relation', disabled && 'sc-picker--disabled', field.invalid && 'sc-picker--invalid')}>
      <div
        class="sc-picker__control"
        onMouseDown={(e) => {
          if (disabled || unavailable || e.target === inputRef.current) return;
          if (e.target instanceof Element && e.target.closest('button')) return;
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {value.map((ref) => (
          <Chip
            key={ref.id}
            icon="file"
            disabled={disabled}
            onRemove={() => {
              remove(ref.id);
            }}
            removeLabel={ref.title || 'Untitled'}
          >
            {ref.title || 'Untitled'}
          </Chip>
        ))}
        <input
          ref={inputRef}
          id={field.id}
          class="sc-picker__input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellcheck={false}
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={[field.describedBy, open ? statusId : undefined].filter(Boolean).join(' ') || undefined}
          aria-invalid={field.invalid ? 'true' : undefined}
          aria-required={field.required ? 'true' : undefined}
          disabled={disabled}
          readOnly={unavailable}
          value={query}
          placeholder={value.length === 0 ? placeholder : undefined}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            if (!unavailable) setOpen(true);
            setActive(0);
          }}
          onClick={() => {
            if (!unavailable) setOpen(true);
          }}
          onFocus={() => {
            if (!unavailable) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
          }}
        />
        <Icon name="search" size={14} class="sc-picker__chevron" />
      </div>
      {unavailable && (
        <p class="sc-relation__status sc-relation__status--error sc-relation__unavailable">
          Can’t search: Sitecatch can’t see the database this relation links to. Make sure you can open it in Notion
          (internal connection: share that database with Sitecatch too), then reload.
        </p>
      )}
      <div class="sc-picker__list sc-relation__panel" hidden={!open}>
        {statusText && (
          <p
            id={statusId}
            class={cx('sc-relation__status', unavailable && 'sc-relation__status--error')}
            role="status"
            aria-live="polite"
          >
            {state.status === 'loading' && <Spinner size="sm" />}
            <span>{statusText}</span>
          </p>
        )}
        {state.status === 'error' && !unavailable && (
          <div id={statusId} class="sc-relation__error" role="alert">
            <p class="sc-relation__status sc-relation__status--error">{state.error.message}</p>
            <Button
              size="sm"
              icon="refresh"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the input so the list stays open
              }}
              onClick={() => {
                setRetryNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}
        <ul id={listId} role="listbox" aria-label={listLabel} aria-multiselectable="true" class="sc-relation__options">
          {options.map((option, i) => {
            const isSelected = selectedIds.has(option.id);
            const emoji = iconText(option);
            return (
              <li
                key={option.id}
                id={`${listId}-${String(i)}`}
                role="option"
                aria-selected={isSelected ? 'true' : 'false'}
                class={cx('sc-picker__option', i === activeIndex && 'sc-picker__option--active')}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onMouseEnter={() => {
                  setActive(i);
                }}
                onClick={() => {
                  toggle(option);
                }}
              >
                {emoji ? (
                  <span class="sc-relation__icon" aria-hidden="true">
                    {emoji}
                  </span>
                ) : (
                  <Icon name="file" size={14} class="sc-relation__icon" />
                )}
                <span class="sc-relation__title">{option.title}</span>
                {isSelected && <Icon name="check" size={14} class="sc-picker__check" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
