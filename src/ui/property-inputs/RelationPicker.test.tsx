import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '@/lib/errors';
import type { PageOption, PropertySchema } from '@/lib/notion/types';
import type { FormValue, RelationRef } from '@/lib/presets/types';
import { PropertyInput } from './PropertyInput';
import { RelationPicker, type PageSearch } from './RelationPicker';

afterEach(() => {
  cleanup();
});

const PAGES: PageOption[] = [
  { id: 'p-kineo', title: 'Kineo Website', icon: { kind: 'emoji', emoji: '🚀' } },
  { id: 'p-blog', title: 'Blog redesign' },
];

function fakeSearch(impl?: (q: string) => Result<PageOption[]>) {
  return vi.fn<PageSearch>((_ds, q) =>
    Promise.resolve(impl ? impl(q) : ok(PAGES.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())))),
  );
}

function Harness(props: {
  initial?: RelationRef[];
  search: PageSearch;
  spy?: (v: RelationRef[]) => void;
  dataSourceId?: string | null;
}) {
  const [value, setValue] = useState<RelationRef[]>(props.initial ?? []);
  return (
    <>
      <label for="rel-input">Projects</label>
      <RelationPicker
        id="rel-input"
        dataSourceId={props.dataSourceId === null ? undefined : (props.dataSourceId ?? 'ds-projects')}
        value={value}
        search={props.search}
        debounceMs={0}
        listLabel="Pages for Projects"
        onChange={(v) => {
          props.spy?.(v);
          setValue(v);
        }}
      />
    </>
  );
}

describe('RelationPicker', () => {
  it('loads recent pages on focus and links one by click', async () => {
    const search = fakeSearch();
    const spy = vi.fn();
    render(<Harness search={search} spy={spy} />);
    await userEvent.click(screen.getByRole('combobox', { name: /Projects/ }));
    expect(await screen.findByRole('option', { name: /Kineo Website/ })).toBeTruthy();
    expect(search).toHaveBeenCalledWith('ds-projects', '');
    await userEvent.click(screen.getByRole('option', { name: /Kineo Website/ }));
    expect(spy).toHaveBeenLastCalledWith([{ id: 'p-kineo', title: 'Kineo Website' }]);
    expect(screen.getByRole('button', { name: 'Remove Kineo Website' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Kineo Website/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('searches with the typed query and picks with the keyboard', async () => {
    const search = fakeSearch();
    const spy = vi.fn();
    render(<Harness search={search} spy={spy} />);
    const input = screen.getByRole('combobox', { name: /Projects/ });
    await userEvent.click(input);
    await userEvent.type(input, 'blog');
    await waitFor(() => {
      expect(search).toHaveBeenLastCalledWith('ds-projects', 'blog');
    });
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /Kineo/ })).toBeNull();
    });
    await userEvent.keyboard('{Enter}');
    expect(spy).toHaveBeenLastCalledWith([{ id: 'p-blog', title: 'Blog redesign' }]);
  });

  it('removes chips with their button and Backspace', async () => {
    const spy = vi.fn();
    render(
      <Harness
        search={fakeSearch()}
        spy={spy}
        initial={[
          { id: 'a', title: 'Alpha' },
          { id: 'b', title: 'Beta' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(spy).toHaveBeenLastCalledWith([{ id: 'b', title: 'Beta' }]);
    await userEvent.click(screen.getByRole('combobox', { name: /Projects/ }));
    await userEvent.keyboard('{Backspace}');
    expect(spy).toHaveBeenLastCalledWith([]);
  });

  it('shows an empty state for a query without matches', async () => {
    render(<Harness search={fakeSearch()} />);
    const input = screen.getByRole('combobox', { name: /Projects/ });
    await userEvent.click(input);
    await userEvent.type(input, 'zzz');
    expect(await screen.findByText(/No pages match “zzz”/)).toBeTruthy();
  });

  it('shows the error with a retry that searches again', async () => {
    let fail = true;
    const search = fakeSearch((q) =>
      fail ? err('network', 'Couldn’t reach Notion. Check your connection and try again.', { action: 'retry' }) : ok(PAGES.filter((p) => p.title.includes(q))),
    );
    render(<Harness search={search} />);
    await userEvent.click(screen.getByRole('combobox', { name: /Projects/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn’t reach Notion/);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('option', { name: /Kineo Website/ })).toBeTruthy();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('explains when the related database is unknown and never searches', async () => {
    const search = fakeSearch();
    render(<Harness search={search} dataSourceId={null} initial={[{ id: 'a', title: 'Alpha' }]} />);
    expect(screen.getByText(/Can’t search: Sitecatch can’t see the database/)).toBeTruthy();
    await userEvent.click(screen.getByRole('combobox', { name: /Projects/ }));
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeTruthy();
  });
});

describe('PropertyInput relation', () => {
  it('renders a RelationPicker for relation properties and emits relation values', async () => {
    const property: PropertySchema = { id: 'rel', name: 'Projects', type: 'relation', relation: { dataSourceId: 'ds-projects' } };
    const spy = vi.fn<(v: FormValue) => void>();
    const search = fakeSearch();
    render(<PropertyInput property={property} value={{ kind: 'relation', value: [] }} onChange={spy} searchPages={search} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Projects' }));
    await userEvent.click(await screen.findByRole('option', { name: /Kineo Website/ }));
    expect(spy).toHaveBeenLastCalledWith({ kind: 'relation', value: [{ id: 'p-kineo', title: 'Kineo Website' }] });
  });
});
