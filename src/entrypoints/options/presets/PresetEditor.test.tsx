import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/lib/errors';
import { getPreset, listPresets, savePreset } from '@/lib/presets/storage';
import { favWebsitesSchema, makePreset, resourcesSchema } from '@/lib/presets/testing';
import type { Preset } from '@/lib/presets/types';
import { connectionsStatus } from '../lib/connections';
import { navigate, resetRouterForTests } from '../lib/router';
import { ACME, DS_FAV, DS_RESOURCES, GLOBEX, mockBackend, schemaHandler } from '../test/mock-backend';
import { PresetEditor } from './PresetEditor';
import { EditPresetRoute, NewPresetRoute } from './PresetRoutes';
import { PresetsList, presetStatus } from './PresetsList';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));

beforeEach(() => {
  fakeBrowser.reset();
  resetRouterForTests();
  connectionsStatus.value = { hostPermission: true, connections: [ACME] };
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
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);

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
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);
    await include('Name');
    const name = row('Name');
    expect(within(name).getByLabelText<HTMLSelectElement>('Extractor').value).toBe('ogTitle');
    const fallback = within(name).getByLabelText<HTMLSelectElement>('Fallback');
    expect(fallback.value).toBe('title');
    expect(optionLabels(fallback)).toContain('No fallback');
    expect(optionLabels(fallback)).not.toContain('Open Graph title');
  });

  it('attaches the screenshot via the files property (canonical) and hides the screenshot extractor', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);
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
    render(<PresetEditor preset={preset} schema={resourcesSchema} connection={ACME} />);
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
    render(<PresetEditor preset={preset} schema={resourcesSchema} connection={ACME} />);
    expect(screen.getByText('Good to know')).toBeTruthy();
    expect(screen.queryByText('Fix these before saving')).toBeNull();
  });

  it('requires a fixed value for static sources', async () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);
    await include('Kind');
    await userEvent.click(within(row('Kind')).getByRole('radio', { name: 'Fixed value' }));
    expect(screen.getByText(/Set a fixed value for “Kind”/, { selector: '.sco-issue-list li' })).toBeTruthy();
  });

  it('sets a fixed relation value with the page picker and blocks while it is empty', async () => {
    const mock = mockBackend({
      'pages/search': (req) =>
        ok([{ id: 'p-kineo', title: 'Kineo Website' }].filter((p) => p.title.includes(req.query ?? ''))),
    });
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} />);
    await include('Related');
    const related = row('Related');
    expect(within(related).queryByRole('radio', { name: 'From the page' })).toBeNull();
    await userEvent.click(within(related).getByRole('radio', { name: 'Fixed value' }));
    expect(screen.getByText(/Set a fixed value for “Related”/, { selector: '.sco-issue-list li' })).toBeTruthy();
    await userEvent.click(within(related).getByRole('combobox', { name: /Value/ }));
    await userEvent.click(await within(related).findByRole('option', { name: /Kineo Website/ }));
    expect(mock).toHaveBeenCalledWith({ type: 'pages/search', dataSourceId: 'ds-projects', query: undefined });
    expect(within(related).getByRole('button', { name: 'Remove Kineo Website' })).toBeTruthy();
    expect(screen.queryByText(/Set a fixed value for “Related”/, { selector: '.sco-issue-list li' })).toBeNull();
  });

  it('lists read-only properties muted', () => {
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);
    expect(screen.getByText('Can’t be filled by Sitecatch')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.queryByText(/Relations aren’t supported/)).toBeNull();
  });

  it('asks before leaving with unsaved changes', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    navigate('/presets/p1');
    render(<PresetEditor preset={basePreset()} schema={resourcesSchema} connection={ACME} />);
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
    expect(send).toHaveBeenCalledWith({ type: 'ds/schema', connectionId: 'ws-acme', dataSourceId: 'ds-resources' });
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

describe('multiple workspaces', () => {
  beforeEach(() => {
    connectionsStatus.value = { hostPermission: true, connections: [ACME, GLOBEX] };
  });

  it('new preset: picks the workspace first, then lists its databases, and binds the preset to it', async () => {
    const send = mockBackend({
      'ds/list': (req) => ({ ok: true, data: req.connectionId === 'ws-globex' ? [DS_FAV] : [DS_RESOURCES] }),
      'ds/schema': schemaHandler([resourcesSchema, favWebsitesSchema]),
    });
    render(<NewPresetRoute />);
    expect(screen.getByText(/Pick the workspace this preset saves into/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Globex/ }));
    expect(send).toHaveBeenCalledWith({ type: 'ds/list', connectionId: 'ws-globex' });
    await userEvent.click(await screen.findByRole('button', { name: /Fav websites/ }));
    expect(send).toHaveBeenCalledWith({ type: 'ds/schema', connectionId: 'ws-globex', dataSourceId: 'ds-fav' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save preset' }));
    await waitFor(async () => {
      expect((await listPresets()).map((p) => [p.connectionId, p.workspaceName])).toEqual([['ws-globex', 'Globex']]);
    });
  });

  it('editor shows the workspace and can move the preset to another workspace’s database', async () => {
    const send = mockBackend({
      'ds/list': () => ({ ok: true, data: [DS_FAV] }),
      'ds/schema': schemaHandler([resourcesSchema, favWebsitesSchema]),
    });
    render(
      <PresetEditor
        preset={basePreset({ connectionId: 'ws-acme', workspaceName: 'Acme' })}
        schema={resourcesSchema}
        connection={ACME}
      />,
    );
    expect(screen.getByText('Acme', { selector: '.sco-db-row__name' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Change workspace' }));
    await userEvent.click(screen.getByRole('button', { name: /Globex/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Fav websites/ }));
    expect(send).toHaveBeenCalledWith({ type: 'ds/schema', connectionId: 'ws-globex', dataSourceId: 'ds-fav', force: true });
    expect(await screen.findByText('Globex', { selector: '.sco-db-row__name' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    await waitFor(async () => {
      expect(await getPreset('p1')).toMatchObject({ ok: true, data: { connectionId: 'ws-globex', dataSourceId: 'ds-fav' } });
    });
  });

  it('an unresolved preset asks for a workspace, then re-validates the schema with it', async () => {
    const send = mockBackend({
      'ds/schema': (req) =>
        req.connectionId === 'ws-globex'
          ? { ok: true, data: resourcesSchema }
          : { ok: false, error: { code: 'db-not-shared', message: 'not here', action: 'reshare-db' } },
    });
    await savePreset(basePreset({ connectionId: 'ws-gone', workspaceName: 'Old Co', dataSourceName: 'Resources' }));
    render(<EditPresetRoute id="p1" />);
    expect(await screen.findByText('Pick a workspace for this preset')).toBeTruthy();
    expect(screen.getByText(/belongs to the “Old Co” workspace, which isn’t connected/)).toBeTruthy();
    // No schema request until a workspace is picked.
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ds/schema' }));

    await userEvent.click(screen.getByRole('button', { name: /Acme/ }));
    expect(await screen.findByText(/isn’t visible in “Acme”/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Globex/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Resources' })).toBeTruthy();
    expect(await getPreset('p1')).toMatchObject({ ok: true, data: { connectionId: 'ws-globex', workspaceName: 'Globex' } });
  });

  it('presets list flags unresolved presets and shows workspaces', async () => {
    mockBackend({ 'ds/schema': schemaHandler([resourcesSchema]) });
    await savePreset(basePreset({ id: 'a', name: 'Alpha', connectionId: 'ws-acme', workspaceName: 'Acme' }));
    await savePreset(basePreset({ id: 'b', name: 'Beta' }));
    await savePreset(basePreset({ id: 'c', name: 'Gamma', connectionId: 'ws-gone', workspaceName: 'Old Co' }));
    render(<PresetsList />);
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(screen.getByText('Pick a workspace')).toBeTruthy();
    expect(screen.getByText('Workspace not connected')).toBeTruthy();
    expect(screen.getByText(/Acme · Resources/)).toBeTruthy();
    expect(screen.getByText(/Old Co · Resources/)).toBeTruthy();
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
