import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { listPresets, savePreset } from '@/lib/presets/storage';
import { allResourcesMappings, makePreset } from '@/lib/presets/testing';
import { settingsItem } from '@/lib/storage/items';
import { authStatus } from '../lib/auth';
import { mockBackend } from '../test/mock-backend';
import { exportFileName, planImport, previewImport } from './import-plan';
import { ImportExport } from './ImportExport';
import { SettingsPage } from './SettingsPage';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));

let exported: { blob: Blob; name: string } | null = null;

beforeEach(() => {
  fakeBrowser.reset();
  exported = null;
  let lastBlob: Blob | null = null;
  vi.stubGlobal(
    'URL',
    Object.assign(Object.create(URL) as typeof URL, {
      createObjectURL: (b: Blob) => {
        lastBlob = b;
        return 'blob:fake';
      },
      revokeObjectURL: () => undefined,
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (lastBlob) exported = { blob: lastBlob, name: this.download };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function exportNow(): Promise<string> {
  await userEvent.click(screen.getByRole('button', { name: 'Export presets' }));
  await waitFor(() => {
    expect(exported).not.toBeNull();
  });
  if (!exported) throw new Error('nothing exported');
  return exported.blob.text();
}

async function importText(text: string) {
  const file = new File([text], 'presets.json', { type: 'application/json' });
  await userEvent.upload(screen.getByTestId('import-file'), file);
}

describe('export / import', () => {
  it('round-trips presets through a JSON file', async () => {
    await savePreset(makePreset({ id: 'a', name: 'Resources', mappings: allResourcesMappings() }));
    await savePreset(makePreset({ id: 'b', name: 'Fav websites' }));
    const before = await listPresets();
    render(<ImportExport />);

    const json = await exportNow();
    expect(exported?.name).toMatch(/^sitecatch-presets-\d{4}-\d{2}-\d{2}\.json$/);
    expect(json).toContain('"format": "sitecatch-presets"');
    expect(json).not.toContain('token');

    fakeBrowser.reset(); // fresh browser
    await importText(json);
    expect(await screen.findByRole('region', { name: 'Import preview' })).toBeTruthy();
    expect(screen.queryByText(/already exist/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 presets' }));
    expect(await screen.findByText('Imported 2 presets.')).toBeTruthy();

    const after = await listPresets();
    expect(after.map(({ updatedAt: _u, ...p }) => p)).toEqual(before.map(({ updatedAt: _u, ...p }) => p));
  });

  it('keeps both on conflict by default, or replaces', async () => {
    await savePreset(makePreset({ id: 'a', name: 'Resources' }));
    render(<ImportExport />);
    const json = await exportNow();

    await importText(json);
    expect(await screen.findByText(/1 preset already exists/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 preset' }));
    await waitFor(async () => {
      expect((await listPresets()).map((p) => p.name)).toEqual(['Resources', 'Resources (imported)']);
    });

    await importText(json);
    await userEvent.click(await screen.findByRole('radio', { name: /Replace the existing presets/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 preset' }));
    await waitFor(async () => {
      expect((await listPresets()).length).toBe(2);
    });
  });

  it('rejects files that are not exports', async () => {
    render(<ImportExport />);
    await importText('{"hello": 1}');
    expect((await screen.findByRole('alert')).textContent).toContain('not a Sitecatch presets export');
  });

  it('plans ids for keep-both and replace', () => {
    const p = makePreset({ id: 'a' });
    const preview = previewImport([p], [p]);
    expect([...preview.conflicts]).toEqual(['a']);
    expect(planImport(preview, 'replace')[0]?.id).toBe('a');
    expect(planImport(preview, 'keep-both', () => 'new')[0]).toMatchObject({ id: 'new', name: 'Resources (imported)' });
    expect(exportFileName(new Date(2026, 0, 5))).toBe('sitecatch-presets-2026-01-05.json');
  });
});

describe('settings page', () => {
  it('saves capture delay and quality, shows the account and disconnects', async () => {
    authStatus.value = { hasToken: true, tokenKind: 'personal', hostPermission: true, workspaceName: 'Acme' };
    const send = mockBackend({ 'auth/status': () => ({ ok: true, data: { hasToken: false, hostPermission: true } }) });
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<SettingsPage />);
    const delay = await screen.findByLabelText('Wait before taking the screenshot');
    // Range inputs: set the value and fire input.
    (delay as HTMLInputElement).value = '2.5';
    delay.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(async () => {
      expect((await settingsItem.getValue()).captureDelayMs).toBe(2500);
    });
    expect(screen.getByText('2.5 s')).toBeTruthy();

    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Personal access token')).toBeTruthy();
    expect(screen.getByText(/Your token never syncs/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(send).toHaveBeenCalledWith({ type: 'auth/clear' });
    expect(await screen.findByText(/Not connected/)).toBeTruthy();
  });
});
