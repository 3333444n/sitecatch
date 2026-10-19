import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotionPropertyType, PropertySchema } from '@/lib/notion/types';
import type { FormValue } from '@/lib/presets/types';
import { fileRefLabel } from './FilesList';
import { OptionPicker } from './OptionPicker';
import { PropertyInput } from './PropertyInput';

afterEach(() => {
  cleanup();
});

const TAG_OPTIONS = [
  { id: '1', name: 'Design', color: 'blue' as const },
  { id: '2', name: 'Dev', color: 'green' as const },
  { id: '3', name: 'Reading', color: 'red' as const },
];

/** Stateful harness so controlled components behave as in the app. */
function Harness(props: { property: PropertySchema; initial: FormValue; spy: (v: FormValue) => void }) {
  const [value, setValue] = useState(props.initial);
  return (
    <PropertyInput
      property={props.property}
      value={value}
      onChange={(v) => {
        props.spy(v);
        setValue(v);
      }}
    />
  );
}

function prop(type: NotionPropertyType, extra: Partial<PropertySchema> = {}): PropertySchema {
  return { id: `id-${type}`, name: `My ${type}`, type, ...extra };
}

function lastValue(spy: ReturnType<typeof vi.fn>): unknown {
  return spy.mock.lastCall?.[0];
}

describe('PropertyInput dispatch', () => {
  it('title/rich_text render a textarea emitting text values', async () => {
    for (const type of ['title', 'rich_text'] as const) {
      const spy = vi.fn();
      render(<Harness property={prop(type)} initial={{ kind: 'text', value: '' }} spy={spy} />);
      const el = screen.getByLabelText(`My ${type}`);
      expect(el.tagName).toBe('TEXTAREA');
      await userEvent.type(el, 'Hi');
      expect(lastValue(spy)).toEqual({ kind: 'text', value: 'Hi' });
      cleanup();
    }
  });

  it.each([
    ['url', 'url'],
    ['email', 'email'],
    ['phone_number', 'tel'],
  ] as const)('%s renders <input type="%s">', (type, inputType) => {
    render(<PropertyInput property={prop(type)} value={{ kind: 'text', value: 'x' }} onChange={vi.fn()} />);
    const el = screen.getByLabelText(`My ${type}`);
    expect(el.tagName).toBe('INPUT');
    expect(el.getAttribute('type')).toBe(inputType);
    expect((el as HTMLInputElement).value).toBe('x');
  });

  it('number emits numbers, null when cleared, and ignores invalid text', async () => {
    const spy = vi.fn();
    render(<Harness property={prop('number')} initial={{ kind: 'number', value: 3 }} spy={spy} />);
    const el = screen.getByLabelText<HTMLInputElement>('My number');
    expect(el.value).toBe('3');
    await userEvent.clear(el);
    expect(lastValue(spy)).toEqual({ kind: 'number', value: null });
    await userEvent.type(el, '4.5');
    expect(lastValue(spy)).toEqual({ kind: 'number', value: 4.5 });
    spy.mockClear();
    await userEvent.type(el, 'x');
    expect(spy).not.toHaveBeenCalled();
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  it('checkbox renders a labelled checkbox', async () => {
    const spy = vi.fn();
    render(<Harness property={prop('checkbox')} initial={{ kind: 'checkbox', value: false }} spy={spy} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'My checkbox' }));
    expect(lastValue(spy)).toEqual({ kind: 'checkbox', value: true });
  });

  it('select renders a combobox and emits the chosen option name', async () => {
    const spy = vi.fn();
    render(
      <Harness property={prop('select', { options: TAG_OPTIONS })} initial={{ kind: 'select', value: null }} spy={spy} />,
    );
    const combo = screen.getByRole('combobox', { name: 'My select' });
    await userEvent.click(combo);
    await userEvent.click(screen.getByRole('option', { name: 'Dev' }));
    expect(lastValue(spy)).toEqual({ kind: 'select', value: 'Dev' });
    // Single select: list closes and the chip shows the value.
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Remove Dev' })).toBeTruthy();
  });

  it('select allows creating an option, status does not', async () => {
    const spy = vi.fn();
    render(
      <Harness property={prop('select', { options: TAG_OPTIONS })} initial={{ kind: 'select', value: null }} spy={spy} />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Brand new{Enter}');
    expect(lastValue(spy)).toEqual({ kind: 'select', value: 'Brand new' });
    cleanup();

    const spy2 = vi.fn();
    render(
      <Harness
        property={prop('status', { options: [{ name: 'Not started' }, { name: 'Done', color: 'green' }] })}
        initial={{ kind: 'select', value: null }}
        spy={spy2}
      />,
    );
    await userEvent.type(screen.getByRole('combobox', { name: 'My status' }), 'Brand new{Enter}');
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
    expect(screen.getByText('No matching options')).toBeTruthy();
    expect(spy2).not.toHaveBeenCalled();
  });

  it('date emits ISO dates and can include time', async () => {
    const spy = vi.fn();
    render(<Harness property={prop('date')} initial={{ kind: 'date', value: null }} spy={spy} />);
    const el = screen.getByLabelText<HTMLInputElement>('My date');
    expect(el.getAttribute('type')).toBe('date');
    fireEvent.input(el, { target: { value: '2026-10-18' } });
    expect(lastValue(spy)).toEqual({ kind: 'date', value: { start: '2026-10-18' } });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include time' }));
    expect(lastValue(spy)).toEqual({ kind: 'date', value: { start: '2026-10-18T00:00' } });
    expect(el.getAttribute('type')).toBe('datetime-local');
    fireEvent.input(el, { target: { value: '' } });
    expect(lastValue(spy)).toEqual({ kind: 'date', value: null });
  });

  it('files renders a read-only list of file chips', () => {
    render(
      <PropertyInput
        property={prop('files')}
        value={{
          kind: 'files',
          value: [{ kind: 'screenshot' }, { kind: 'external', url: 'https://example.com/img/og.png' }],
        }}
        onChange={vi.fn()}
      />,
    );
    const group = screen.getByRole('group', { name: 'My files' });
    expect(group.textContent).toContain('Screenshot');
    expect(group.textContent).toContain('og.png');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['people', 'relation', 'formula', 'unsupported'] as const)('%s renders a "not editable" note', (type) => {
    render(<PropertyInput property={prop(type)} value={{ kind: 'text', value: '' }} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: `My ${type}` }).textContent).toMatch(/can’t be edited/);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('treats a mismatched value kind as empty instead of crashing', () => {
    render(<PropertyInput property={prop('multi_select')} value={{ kind: 'text', value: 'oops' }} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('passes required and error through to the control', () => {
    render(
      <PropertyInput
        property={prop('url')}
        value={{ kind: 'text', value: '' }}
        onChange={vi.fn()}
        required
        error="Enter a URL"
      />,
    );
    const el = screen.getByLabelText(/My url/);
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a URL')).toBeTruthy();
  });
});

describe('multi_select chip input', () => {
  function setup(initial: string[] = []) {
    const spy = vi.fn();
    render(
      <Harness
        property={prop('multi_select', { name: 'Tags', options: TAG_OPTIONS })}
        initial={{ kind: 'multi_select', value: initial }}
        spy={spy}
      />,
    );
    return { spy, combo: screen.getByRole('combobox', { name: 'Tags' }) };
  }

  it('picks existing options by click and hides already-selected ones', async () => {
    const { spy, combo } = setup();
    await userEvent.click(combo);
    await userEvent.click(screen.getByRole('option', { name: 'Design' }));
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Design'] });
    expect(screen.queryByRole('option', { name: 'Design' })).toBeNull();
    // List stays open for picking more.
    expect(combo.getAttribute('aria-expanded')).toBe('true');
  });

  it('filters while typing and picks the highlighted option with Enter', async () => {
    const { spy, combo } = setup();
    await userEvent.type(combo, 're');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Reading', 'Createre']);
    await userEvent.keyboard('{Enter}');
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Reading'] });
    expect((combo as HTMLInputElement).value).toBe('');
  });

  it('creates a new option with Enter when nothing matches', async () => {
    const { spy, combo } = setup(['Dev']);
    await userEvent.type(combo, 'Podcasts');
    expect(screen.getByRole('option', { name: /Create\s*Podcasts/ })).toBeTruthy();
    await userEvent.keyboard('{Enter}');
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Dev', 'Podcasts'] });
    expect(screen.getByRole('button', { name: 'Remove Podcasts' })).toBeTruthy();
  });

  it('does not offer to create a case-insensitive duplicate', async () => {
    const { combo } = setup(['Dev']);
    await userEvent.type(combo, 'dev');
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
    await userEvent.clear(combo);
    await userEvent.type(combo, 'design');
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
    expect(screen.getByRole('option', { name: 'Design' })).toBeTruthy();
  });

  it('navigates with arrow keys and tracks aria-activedescendant', async () => {
    const { spy, combo } = setup();
    combo.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    const first = combo.getAttribute('aria-activedescendant');
    expect(first && document.getElementById(first)?.textContent).toBe('Design');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const third = combo.getAttribute('aria-activedescendant');
    expect(third && document.getElementById(third)?.textContent).toBe('Reading');
    await userEvent.keyboard('{ArrowDown}');
    const wrapped = combo.getAttribute('aria-activedescendant');
    expect(wrapped && document.getElementById(wrapped)?.textContent).toBe('Design');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Reading'] });
    await userEvent.keyboard('{Escape}');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
  });

  it('removes chips with the × button and with Backspace on an empty input', async () => {
    const { spy, combo } = setup(['Design', 'Dev', 'Reading']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Dev' }));
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Design', 'Reading'] });
    combo.focus();
    await userEvent.keyboard('{Backspace}');
    expect(lastValue(spy)).toEqual({ kind: 'multi_select', value: ['Design'] });
  });

  it('Enter does not submit a surrounding form while picking', async () => {
    const onSubmit = vi.fn((e: Event) => {
      e.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <OptionPicker options={TAG_OPTIONS} value={[]} onChange={vi.fn()} multiple id="picker" />
      </form>,
    );
    const combo = screen.getByRole('combobox');
    await userEvent.type(combo, 'zzz{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    render(<OptionPicker options={TAG_OPTIONS} value={['Dev']} onChange={vi.fn()} multiple disabled />);
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Remove Dev' })).toBeNull();
  });
});

describe('fileRefLabel', () => {
  it('labels file refs', () => {
    expect(fileRefLabel({ kind: 'screenshot' })).toBe('Screenshot');
    expect(fileRefLabel({ kind: 'external', url: 'https://x.dev/a/logo%20big.png' })).toBe('logo big.png');
    expect(fileRefLabel({ kind: 'external', url: 'https://x.dev/' })).toBe('x.dev');
    expect(fileRefLabel({ kind: 'external', url: 'https://x.dev/f.ico', name: 'Favicon' })).toBe('Favicon');
  });
});
