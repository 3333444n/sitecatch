import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getPreset, listPresets, savePreset } from '@/lib/presets/storage';
import { makePreset, resourcesSchema } from '@/lib/presets/testing';
import type { Preset } from '@/lib/presets/types';
import { authStatus } from '../lib/auth';
import { navigate, resetRouterForTests } from '../lib/router';
import { DS_RESOURCES, mockBackend, schemaHandler } from '../test/mock-backend';
import { PresetEditor } from './PresetEditor';
import { NewPresetRoute } from './PresetRoutes';
import { PresetsList, presetStatus } from './PresetsList';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));

beforeEach(() => {
  fakeBrowser.reset();
  resetRouterForTests();
  authStatus.value = { hasToken: true, tokenKind: 'personal', hostPermission: true, workspaceName: 'Acme' };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function row(name: string): HTMLElement {
  const el = screen.getByText(name, { selector: '.sco-prop__name' }).closest('li');
  if (!el) throw new Error(`row ${name} not found`);
  return el;
}

async function include(name: string) {
  await userEvent.click(within(row(name)).getByRole('switch', { name: `Include ${name}` }));
}

function optionLabels(select: HTMLElement): string[] {
  return [...select.querySelectorAll('option')].map((o) => o.textContent);
}

function basePreset(overrides: Partial<Preset> = {}): Preset {
  return makePreset({ id: 'p1', dataSourceId: 'ds-resources', ...overrides });
}

describe('preset editor', () => {
  it('filters extractors by property type (fonts for multi_select, not for date)', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);

    await include('Tags');
    const tags = row('Tags');
    // Multi-select defaults to "Ask in popup"; switch to the page.
    await userEvent.click(within(tags).getByRole('radio', { name: 'From the page' }));
    const tagsExtractor = within(tags).getByLabelText('Extractor');
    expect(optionLabels(tagsExtractor)).toContain('Fonts');

    await include('Saved');
    const saved = row('Saved');
    expect(optionLabels(within(saved).getByLabelText('Extractor'))).toEqual(['Date saved']);
    expect(within(saved).queryByRole('radio', { name: 'Ask in popup' })).toBeTruthy();
  });

  it('shows the extractor description and an optional fallback', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    await include('Name');
    const name = row('Name');
    expect(within(name).getByLabelText<HTMLSelectElement>('Extractor').value).toBe('ogTitle');
    const fallback = within(name).getByLabelText<HTMLSelectElement>('Fallback');
    expect(fallback.value).toBe('title');
    expect(optionLabels(fallback)).toContain('No fallback');
    expect(optionLabels(fallback)).not.toContain('Open Graph title');
  });

  it('attaches the screenshot via the files property (canonical) and hides the screenshot extractor', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    await include('Screenshots');
    const extractor = within(row('Screenshots')).getByLabelText('Extractor');
    expect(optionLabels(extractor)).toEqual(['Favicon', 'Preview image']);
    expect(within(row('Screenshots')).queryByRole('radio', { name: 'Ask in popup' })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Attach screenshot to'), 'shots');
    expect(within(row('Screenshots')).getByText('Gets the screenshot')).toBeTruthy();
    expect(within(row('Screenshots')).queryByRole('switch')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    await waitFor(async () => {
      const saved = await getPreset('p1');
      expect(saved.ok && saved.data.screenshot.filesPropertyId).toBe('shots');
      expect(saved.ok && saved.data.mappings.some((m) => m.propertyId === 'shots')).toBe(false);
    });
  });

  it('shows blocking issues, disables save, and can remove what is missing', async () => {
    const preset = basePreset({
      mappings: [
        { propertyId: 'gone', propertyName: 'Old prop', propertyType: 'rich_text', source: { kind: 'ask' }, editableInPopup: true },
      ],
    });
    render(<PresetEditor preset={preset} schema={resourcesSchema} />);
    const banner = screen.getByTestId('validation');
    expect(within(banner).getByText('Fix these before saving')).toBeTruthy();
    expect(within(banner).getByText(/Old prop/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save preset' })).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByRole('button', { name: 'Remove what’s missing' }));
    expect(screen.queryByText('Fix these before saving')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toHaveProperty('disabled', false);
  });

  it('shows non-blocking notices as info (renamed property)', () => {
    const preset = basePreset({
      mappings: [
        { propertyId: 'notes', propertyName: 'Old notes', propertyType: 'rich_text', source: { kind: 'ask' }, editableInPopup: true },
      ],
    });
    render(<PresetEditor preset={preset} schema={resourcesSchema} />);
    expect(screen.getByText('Good to know')).toBeTruthy();
    expect(screen.queryByText('Fix these before saving')).toBeNull();
  });

  it('requires a fixed value for static sources', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    await include('Kind');
    await userEvent.click(within(row('Kind')).getByRole('radio', { name: 'Fixed value' }));
    expect(screen.getByText(/Set a fixed value for “Kind”/, { selector: '.sco-issue-list li' })).toBeTruthy();
  });

  it('lists read-only properties muted', () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    expect(screen.getByText('Can’t be filled by Sitecatch')).toBeTruthy();
    expect(screen.getByText('Related')).toBeTruthy();
    expect(screen.getByText('Relations aren’t supported yet')).toBeTruthy();
  });

  it('asks before leaving with unsaved changes', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    navigate('/presets/p1');
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), ' edited');
    navigate('/settings');
    expect(confirm).toHaveBeenCalled();
    expect(location.hash).toBe('#/presets/p1');
  });
});

describe('new preset', () => {
  it('picks a data source, loads its schema and creates an empty preset', async () => {
    const send = mockBackend({ 'ds/list': () => ({ ok: true, data: [DS_RESOURCES] }), 'ds/schema': schemaHandler([resourcesSchema]) });
    render(<NewPresetRoute />);
    await userEvent.click(await screen.findByRole('button', { name: /Resources/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New preset' })).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'ds/schema', dataSourceId: 'ds-resources' });
    // createEmptyPreset defaults: title + first url mapped, url used for dedupe.
    expect(within(row('Name')).getByRole('switch', { name: 'Include Name' })).toHaveProperty('checked', true);
    expect(within(row('URL')).getByRole('switch', { name: 'Include URL' })).toHaveProperty('checked', true);
    expect(screen.getByLabelText<HTMLSelectElement>('Compare page URL with').value).toBe('p%3Aurl');

    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    await waitFor(async () => {
      expect((await listPresets()).map((p) => p.name)).toEqual(['Resources']);
    });
  });
});

describe('presets list', () => {
  it('shows status badges, reorders, duplicates and deletes with confirmation', async () => {
    mockBackend({ 'ds/schema': schemaHandler([resourcesSchema]) });
    await savePreset(basePreset({ id: 'a', name: 'Alpha' }));
    await savePreset(basePreset({ id: 'b', name: 'Beta', dataSourceId: 'ds-unknown', dataSourceName: 'Elsewhere' }));
    render(<PresetsList />);
    expect(await screen.findByText('Alpha')).toBeTruthy();
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(await screen.findByText('Database not shared')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Move Beta up' }));
    await waitFor(async () => {
      expect((await listPresets()).map((p) => p.name)).toEqual(['Beta', 'Alpha']);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Duplicate Alpha' }));
    expect(await screen.findByText('Alpha (copy)')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Beta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Beta”' }));
    await waitFor(async () => {
      expect((await listPresets()).map((p) => p.name)).toEqual(['Alpha', 'Alpha (copy)']);
    });
  });

  it('derives status from validation', () => {
    expect(presetStatus(basePreset(), { status: 'ok', schema: resourcesSchema }).label).toBe('Ready');
    expect(presetStatus(basePreset({ name: '' }), { status: 'ok', schema: resourcesSchema }).label).toBe('Needs fix');
    expect(presetStatus(basePreset(), undefined).label).toBe('Checking…');
  });
});
