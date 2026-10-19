import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError, AppErrorAction } from '@/lib/errors';
import { ErrorBanner, ERROR_ACTION_LABELS } from './Banner';
import { Button } from './Button';
import { Chip, notionColorClass } from './Chip';
import { Field } from './Field';
import { ScreenshotSlot } from './ScreenshotSlot';
import { Stepper } from './Stepper';
import { Icon } from './Icon';
import { SegmentedControl } from './SegmentedControl';
import { Tabs } from './Tabs';
import { TextInput } from './TextInput';
import { Thumbnail } from './Thumbnail';

afterEach(() => {
  cleanup();
});

describe('ErrorBanner', () => {
  const cases: [AppErrorAction, string][] = [
    ['open-setup', 'Open setup'],
    ['reshare-db', 'How to share'],
    ['retry', 'Retry'],
    ['edit-preset', 'Edit preset'],
    ['grant-permission', 'Grant access'],
  ];

  it.each(cases)('maps action %s to a "%s" button that emits the action', async (action, label) => {
    const onAction = vi.fn();
    const error: AppError = { code: 'unknown', message: 'Something broke.', action };
    render(<ErrorBanner error={error} onAction={onAction} />);
    expect(ERROR_ACTION_LABELS[action]).toBe(label);
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
  });

  it('renders the message as an alert and no action button without an action', () => {
    render(<ErrorBanner error={{ code: 'network', message: 'You seem to be offline.' }} onAction={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('You seem to be offline.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows developer detail in a disclosure', () => {
    render(<ErrorBanner error={{ code: 'validation', message: 'Notion rejected it.', detail: 'HTTP 400 body.x' }} />);
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByText('HTTP 400 body.x')).toBeTruthy();
  });
});

describe('Button', () => {
  it('is disabled, busy and not clickable while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /Saving/ });
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is clickable when not loading and defaults to type="button"', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.getAttribute('type')).toBe('button');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ScreenshotSlot', () => {
  it('renders the image when it loads', () => {
    render(<ScreenshotSlot src="/setup/step-1.png" alt="Integrations page" caption="Step 1" />);
    expect(screen.getByRole('img', { name: 'Integrations page' }).tagName).toBe('IMG');
    expect(screen.getByText('Step 1')).toBeTruthy();
  });

  it('falls back to a placeholder when the image fails to load', () => {
    render(<ScreenshotSlot src="/setup/missing.png" alt="Integrations page" />);
    fireEvent.error(screen.getByRole('img', { name: 'Integrations page' }));
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Screenshot coming soon')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Integrations page \(screenshot coming soon\)/ })).toBeTruthy();
  });

  it('shows the placeholder when src is missing', () => {
    render(<ScreenshotSlot alt="Share menu" />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Screenshot coming soon')).toBeTruthy();
  });

  it('retries when src changes after a failure', () => {
    const { rerender } = render(<ScreenshotSlot src="/a.png" alt="Shot" />);
    fireEvent.error(screen.getByRole('img', { name: 'Shot' }));
    rerender(<ScreenshotSlot src="/b.png" alt="Shot" />);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/b.png');
  });
});

describe('Thumbnail', () => {
  it('opens a lightbox on click and closes on Escape, restoring focus', async () => {
    render(<Thumbnail src="data:image/jpeg;base64,AAAA" alt="Page screenshot" />);
    const trigger = screen.getByRole('button', { name: 'Enlarge: Page screenshot' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Page screenshot' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close preview' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('shows a placeholder when the image fails', () => {
    render(<Thumbnail src="blob:broken" alt="Page screenshot" />);
    fireEvent.error(screen.getByRole('img', { name: 'Page screenshot' }));
    expect(screen.getByText('No preview')).toBeTruthy();
  });
});

describe('Field', () => {
  it('wires label, required marker, hint and error to the control', () => {
    render(
      <Field label="Token" hint="Starts with ntn_" error="That token is not valid." required>
        <TextInput value="" onChange={vi.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText(/Token/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input).toHaveProperty('required', true);
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const texts = describedBy.split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['That token is not valid.', 'Starts with ntn_']);
  });
});

describe('Chip', () => {
  it('maps Notion colors and falls back to default', () => {
    expect(notionColorClass('blue')).toBe('sc-chip--blue');
    expect(notionColorClass(undefined)).toBe('sc-chip--default');
    render(<Chip color="green">Done</Chip>);
    expect(screen.getByText('Done').parentElement?.className).toContain('sc-chip--green');
  });

  it('exposes an accessible remove button', async () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>Design</Chip>);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Design' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('Stepper', () => {
  it('derives complete/current/upcoming from the current index', () => {
    render(
      <Stepper
        current={1}
        steps={[
          { id: 'a', title: 'Create integration' },
          { id: 'b', title: 'Paste token' },
          { id: 'c', title: 'Share database' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.className).toContain('sc-steps__item--complete');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[2]?.className).toContain('sc-steps__item--upcoming');
  });
});

describe('Tabs', () => {
  it('selects tabs with arrow keys', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Settings"
        value="presets"
        onChange={onChange}
        items={[
          { id: 'presets', label: 'Presets' },
          { id: 'settings', label: 'Settings' },
        ]}
      >
        Panel
      </Tabs>,
    );
    const tab = screen.getByRole('tab', { name: 'Presets' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    tab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('settings');
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'extractor', label: 'From the page' },
    { value: 'static', label: 'Fixed value' },
    { value: 'ask', label: 'Ask in popup', disabled: true },
    { value: 'none', label: 'Empty' },
  ];

  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState('extractor');
    return (
      <SegmentedControl
        label="Source"
        value={value}
        options={options}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }

  it('exposes a radio group with one checked radio and a single tab stop', () => {
    render(<SegmentedControl label="Source" value="static" options={options} onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Source' });
    const radios = screen.getAllByRole('radio');
    expect(group.contains(radios[0] ?? null)).toBe(true);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it('selects on click and ignores clicks on the selected segment', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Source" value="extractor" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'From the page' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('radio', { name: 'Fixed value' }));
    expect(onChange).toHaveBeenCalledWith('static');
  });

  it('moves selection and focus with arrow keys, skipping disabled segments and wrapping', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('radio', { name: 'From the page' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('static');
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('none');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Empty' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('extractor');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('none');
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('extractor');
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('none');
    expect(screen.getByRole('radio', { name: 'Empty' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Icon', () => {
  it.each(['eye', 'eye-off', 'refresh', 'chevron-up'] as const)('renders %s', (name) => {
    const { container } = render(<Icon name={name} label={name} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe(name);
    expect(svg?.children.length).toBeGreaterThan(0);
  });
});
