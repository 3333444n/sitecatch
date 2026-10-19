import { useEffect, useRef, useState } from 'preact/hooks';
import type { SelectOption } from '@/lib/notion/types';
import { Chip } from '@/ui/components/Chip';
import { cx } from '@/ui/components/cx';
import { useFieldControl } from '@/ui/components/Field';
import { Icon } from '@/ui/components/Icon';

export interface OptionPickerProps {
  /** Options from the data source schema. */
  options: SelectOption[];
  /** Selected option names (at most one when `multiple` is false). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Multi-select chip input vs. single choice. */
  multiple?: boolean;
  /** Let the user type a name and press Enter to add an option that doesn't exist yet. */
  allowCreate?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Pill-shaped chips (Notion's status look). */
  pill?: boolean;
  id?: string;
  /** Accessible name for the option list. */
  listLabel?: string;
}

type Item = { kind: 'option'; name: string; option: SelectOption } | { kind: 'create'; name: string };

function lower(s: string): string {
  return s.toLocaleLowerCase();
}

/**
 * Combobox for select / status / multi_select. Type to filter, ↑/↓ to move,
 * Enter to pick (or create), Backspace on an empty input removes the last chip,
 * Esc closes the list.
 */
export function OptionPicker({
  options,
  value,
  onChange,
  multiple = false,
  allowCreate = false,
  disabled = false,
  placeholder,
  pill = false,
  id,
  listLabel = 'Options',
}: OptionPickerProps) {
  const field = useFieldControl(id);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${field.id}-listbox`;

  const q = query.trim();
  const ql = lower(q);
  const selected = new Set(value.map(lower));
  const byName = new Map(options.map((o) => [lower(o.name), o]));

  const items: Item[] = options
    .filter((o) => (multiple ? !selected.has(lower(o.name)) : true))
    .filter((o) => ql === '' || lower(o.name).includes(ql))
    .map((o) => ({ kind: 'option' as const, name: o.name, option: o }));
  if (allowCreate && q !== '' && !byName.has(ql) && !selected.has(ql)) {
    items.push({ kind: 'create', name: q });
  }
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  const activeId = open && activeIndex >= 0 ? `${listId}-${String(activeIndex)}` : undefined;

  useEffect(() => {
    if (!open || !activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[id="${activeId}"]`);
    if (el && 'scrollIntoView' in el) el.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  function choose(item: Item) {
    if (multiple) {
      onChange([...value, item.name]);
      setQuery('');
      setActive(0);
      setOpen(true);
    } else {
      onChange([item.name]);
      setQuery('');
      setOpen(false);
    }
    inputRef.current?.focus();
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(0);
        } else if (items.length > 0) setActive((activeIndex + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(Math.max(items.length - 1, 0));
        } else if (items.length > 0) setActive((activeIndex - 1 + items.length) % items.length);
        break;
      case 'Enter': {
        const item = open ? items[activeIndex] : undefined;
        if (item) {
          e.preventDefault();
          choose(item);
        } else if (open || q !== '') {
          // Don't submit the surrounding form while the user is picking.
          e.preventDefault();
          setOpen(true);
        }
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        } else if (query !== '') {
          e.preventDefault();
          setQuery('');
        }
        break;
      case 'Backspace': {
        const last = value[value.length - 1];
        if (query === '' && last !== undefined) {
          e.preventDefault();
          remove(last);
        }
        break;
      }
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const emptyText = allowCreate ? 'Type to create an option' : q ? 'No matching options' : 'No options';

  return (
    <div class={cx('sc-picker', disabled && 'sc-picker--disabled', field.invalid && 'sc-picker--invalid')}>
      <div
        class="sc-picker__control"
        onMouseDown={(e) => {
          if (disabled || e.target === inputRef.current) return;
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {value.map((name) => (
          <Chip
            key={name}
            color={byName.get(lower(name))?.color}
            shape={pill ? 'pill' : 'rect'}
            disabled={disabled}
            onRemove={() => {
              remove(name);
            }}
            removeLabel={name}
          >
            {name}
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
          aria-describedby={field.describedBy}
          aria-invalid={field.invalid ? 'true' : undefined}
          aria-required={field.required ? 'true' : undefined}
          disabled={disabled}
          value={query}
          placeholder={value.length === 0 ? placeholder : undefined}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setOpen(true);
            setActive(0);
          }}
          onClick={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
        />
        <Icon name="chevron-down" size={14} class="sc-picker__chevron" />
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={listLabel}
        class="sc-picker__list"
        hidden={!open}
      >
        {items.length === 0 && (
          <li class="sc-picker__empty" role="presentation">
            {emptyText}
          </li>
        )}
        {items.map((item, i) => {
          const isSelected = item.kind === 'option' && !multiple && selected.has(lower(item.name));
          return (
            <li
              key={`${item.kind}:${item.name}`}
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
                choose(item);
              }}
            >
              {item.kind === 'create' ? (
                <>
                  <span class="sc-picker__create">Create</span>
                  <Chip shape={pill ? 'pill' : 'rect'}>{item.name}</Chip>
                </>
              ) : (
                <>
                  <Chip color={item.option.color} shape={pill ? 'pill' : 'rect'}>
                    {item.name}
                  </Chip>
                  {isSelected && <Icon name="check" size={14} class="sc-picker__check" />}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
