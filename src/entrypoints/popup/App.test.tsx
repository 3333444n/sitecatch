import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { err, ok, type AppError, type Result } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { AnyRequest, JobState, Request, RequestType, Response } from '@/lib/messaging/protocol';
import { savePreset } from '@/lib/presets/storage';
import { makeCapture, makePreset, resourcesSchema } from '@/lib/presets/testing';
import type { Mapping, Preset } from '@/lib/presets/types';
import { jobItem, lastJobItem } from '@/lib/storage/items';
import { getLastPresetId, setLastPresetId } from '@/lib/storage/settings';
import { App } from './App';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));
const send = vi.mocked(sendRequest);

type Routes = { [K in RequestType]?: (req: Request<K>) => Result<Response<K>> | Promise<Result<Response<K>>> };

const TAB_URL = 'https://example.com/article?utm_source=x';

const TITLE: Mapping = {
  propertyId: 'title',
  propertyName: 'Name',
  propertyType: 'title',
  source: { kind: 'extractor', extractor: 'ogTitle', fallbacks: ['title'] },
  editableInPopup: true,
};
const URL_MAPPING: Mapping = {
  propertyId: 'p%3Aurl',
  propertyName: 'URL',
  propertyType: 'url',
  source: { kind: 'extractor', extractor: 'url' },
  editableInPopup: false,
};
const RATING_REQUIRED: Mapping = {
  propertyId: 'rating',
  propertyName: 'Rating',
  propertyType: 'number',
  source: { kind: 'ask', required: true },
  editableInPopup: true,
};

const PRESET = makePreset({ mappings: [TITLE, URL_MAPPING], dedupe: { propertyId: 'p%3Aurl' } });

let routes: Routes;
let tabsCreate: ReturnType<typeof vi.fn>;
let windowClose: ReturnType<typeof vi.spyOn>;

function requests<T extends RequestType>(type: T): Request<T>[] {
  return send.mock.calls.map(([r]) => r as AnyRequest).filter((r) => r.type === type) as unknown as Request<T>[];
}

async function job(id: string): Promise<Result<JobState>> {
  const value = await jobItem(id).getValue();
  return value ? ok(value) : err('not-found', 'gone');
}

async function setup(presets: Preset[] = [PRESET], extraRoutes: Routes = {}) {
  for (const p of presets) await savePreset(p);
  routes = { ...routes, ...extraRoutes };
  render(<App />);
}

beforeEach(() => {
  fakeBrowser.reset();
  routes = {
    'auth/status': () => ok({ hasToken: true, hostPermission: true }),
    'capture/run': () => ok(makeCapture()),
    'ds/schema': (r) => ok({ ...resourcesSchema, id: r.dataSourceId }),
    'dup/check': () => ok({ matches: [] }),
    'save/start': () => ok({ jobId: 'job-1' }),
    'job/get': (r) => job(r.jobId),
  };
  send.mockImplementation(((req: AnyRequest) => {
    const handler = routes[req.type] as ((r: AnyRequest) => unknown) | undefined;
    return Promise.resolve(handler ? handler(req) : err('unknown', `unmocked ${req.type}`));
  }) as typeof sendRequest);
  vi.spyOn(fakeBrowser.tabs, 'query').mockReturnValue(
    Promise.resolve([{ id: 7, url: TAB_URL, title: 'Example article', active: true }]) as never,
  );
  tabsCreate = vi.fn(() => Promise.resolve({} as never));
  vi.spyOn(fakeBrowser.tabs, 'create').mockImplementation(tabsCreate as never);
  windowClose = vi.spyOn(window, 'close').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
});

const saveButton = () => screen.findByRole('button', { name: /^Save to / });

describe('setup states', () => {
  it('shows NoSetup without a token and opens options #/setup', async () => {
    await setup([PRESET], { 'auth/status': () => ok({ hasToken: false, hostPermission: true }) });
    expect(await screen.findByText('Connect Sitecatch to Notion')).toBeTruthy();
    expect(requests('capture/run')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Open setup' }));
    await waitFor(() => {
      expect(windowClose).toHaveBeenCalled();
    });
    expect(tabsCreate).toHaveBeenCalledWith({ url: expect.stringMatching(/options\.html#\/setup$/) as unknown });
  });

  it('offers Grant access when only the host permission is missing (requested synchronously)', async () => {
    const request = vi.spyOn(fakeBrowser.permissions, 'request').mockReturnValue(Promise.resolve(false) as never);
    await setup([PRESET], { 'auth/status': () => ok({ hasToken: true, hostPermission: false }) });
    const grant = await screen.findByRole('button', { name: 'Grant access' });
    fireEvent.click(grant);
    expect(request).toHaveBeenCalledWith({ origins: ['https://api.notion.com/*'] });
  });

  it('shows the empty state when there are no presets', async () => {
    await setup([]);
    expect(await screen.findByText('Create your first preset')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Create a preset' }));
    await waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: expect.stringMatching(/#\/presets$/) as unknown });
    });
  });
});

describe('form', () => {
  it('defaults to lastPresetId and validates that preset’s data source', async () => {
    const second = makePreset({ id: 'preset-2', name: 'Fav', dataSourceId: 'ds-fav', dataSourceName: 'Fav', mappings: [TITLE] });
    await setLastPresetId('preset-2');
    await setup([PRESET, second]);
    const picker = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Preset' });
    expect(picker.value).toBe('preset-2');
    await waitFor(() => {
      expect(requests('ds/schema').map((r) => r.dataSourceId)).toEqual(['ds-fav']);
    });
  });

  it('pre-fills from the capture, shows read-only mappings and runs capture + dup check in parallel', async () => {
    await setup();
    const title = await screen.findByLabelText<HTMLTextAreaElement>('Name');
    expect(title.value).toBe('Example — OG');
    expect(screen.getByText('URL').closest('div')?.textContent).toContain(TAB_URL);
    expect(requests('capture/run')).toEqual([{ type: 'capture/run', tabId: 7 }]);
    expect(requests('dup/check')).toEqual([{ type: 'dup/check', presetId: 'preset-1', url: TAB_URL }]);
    expect(screen.getByText('example.com')).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });
  });

  it('keeps the user’s edit of a shared property when switching presets', async () => {
    const second = makePreset({ id: 'preset-2', name: 'Fav', dataSourceId: 'ds-fav', dataSourceName: 'Fav', mappings: [TITLE] });
    await setup([PRESET, second]);
    const title = await screen.findByLabelText<HTMLTextAreaElement>('Name');
    await userEvent.clear(title);
    await userEvent.type(title, 'My title');
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), { target: { value: 'preset-2' } });
    await waitFor(() => {
      expect(requests('ds/schema').map((r) => r.dataSourceId)).toContain('ds-fav');
    });
    expect(screen.getByLabelText<HTMLTextAreaElement>('Name').value).toBe('My title');
    expect(await getLastPresetId()).toBe('preset-2');
  });

  it('blocks Save until a required ask field is filled', async () => {
    await setup([makePreset({ mappings: [TITLE, RATING_REQUIRED] })]);
    const button = await saveButton();
    await waitFor(() => {
      expect(screen.getByText('Fill in Rating to save.')).toBeTruthy();
    });
    expect(button).toHaveProperty('disabled', true);
    await userEvent.type(screen.getByLabelText(/Rating/), '4');
    await waitFor(() => {
      expect(button).toHaveProperty('disabled', false);
    });
  });

  it('shows a restricted-page warning but still allows saving', async () => {
    await setup([PRESET], {
      'capture/run': () =>
        ok(
          makeCapture({
            restricted: true,
            restrictedReason: 'Firefox doesn’t allow extensions on add-on store pages.',
            values: {},
          }),
        ),
    });
    expect(await screen.findByText(/add-on store pages/)).toBeTruthy();
    expect(screen.getByText('No screenshot for this page.')).toBeTruthy();
    const button = await saveButton();
    await waitFor(() => {
      expect(button).toHaveProperty('disabled', false);
    });
  });

  it('shows blocking preset issues with Edit preset and disables Save', async () => {
    const broken = makePreset({
      mappings: [TITLE, { ...URL_MAPPING, propertyId: 'gone', propertyName: 'Old' }],
    });
    await setup([broken]);
    expect(await screen.findByText('This preset needs fixing')).toBeTruthy();
    expect(await saveButton()).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('button', { name: 'Edit preset' }));
    await waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: expect.stringMatching(/#\/presets\/preset-1$/) as unknown });
    });
  });

  it('saves with Cmd/Ctrl+Enter', async () => {
    await setup();
    const button = await saveButton();
    await waitFor(() => {
      expect(button).toHaveProperty('disabled', false);
    });
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(requests('save/start')).toHaveLength(1);
    });
    expect(requests('save/start')[0]?.mode).toEqual({ kind: 'create' });
  });
});

describe('duplicates', () => {
  const matches = [
    { pageId: 'old', url: 'https://notion.so/old', title: 'Older copy', lastEditedTime: '2026-01-01T00:00:00.000Z' },
    { pageId: 'new', url: 'https://notion.so/new', title: 'Example article', lastEditedTime: new Date().toISOString() },
  ];

  async function setupDup() {
    await setup([PRESET], { 'dup/check': () => ok({ matches }) });
    await screen.findByText('Already in Resources');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update existing' })).toHaveProperty('disabled', false);
    });
  }

  it('shows the most recent match and adapts the Save label', async () => {
    await setupDup();
    const banner = screen.getByText('Already in Resources').closest('.sc-banner');
    expect(banner?.textContent).toContain('Example article');
    expect(banner?.textContent).toContain('saved just now');
    expect(banner?.textContent).toContain('1 more page');
    expect(screen.getAllByRole('button', { name: 'Save as duplicate' })).toHaveLength(2);
  });

  it('Update existing saves in update mode for the latest match', async () => {
    await setupDup();
    await userEvent.click(screen.getByRole('button', { name: 'Update existing' }));
    await waitFor(() => {
      expect(requests('save/start')[0]?.mode).toEqual({ kind: 'update', pageId: 'new' });
    });
  });

  it('Save as duplicate saves in duplicate mode', async () => {
    await setupDup();
    const [bannerButton] = screen.getAllByRole('button', { name: 'Save as duplicate' });
    if (!bannerButton) throw new Error('missing button');
    await userEvent.click(bannerButton);
    await waitFor(() => {
      expect(requests('save/start')[0]?.mode).toEqual({ kind: 'duplicate' });
    });
  });

  it('Open existing opens the match in a new tab without saving', async () => {
    await setupDup();
    await userEvent.click(screen.getByRole('button', { name: 'Open existing' }));
    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://notion.so/new' });
    expect(requests('save/start')).toHaveLength(0);
  });
});

describe('saving', () => {
  async function startSaving() {
    await setup();
    const button = await saveButton();
    await waitFor(() => {
      expect(button).toHaveProperty('disabled', false);
    });
    await userEvent.click(button);
  }

  it('follows job progress to success with an Open in Notion link', async () => {
    await jobItem('job-1').setValue({ id: 'job-1', status: 'queued', startedAt: new Date().toISOString() });
    await startSaving();
    expect(requests('save/start')[0]).toMatchObject({
      presetId: 'preset-1',
      mode: { kind: 'create' },
      values: { title: { kind: 'text', value: 'Example — OG' }, 'p%3Aurl': { kind: 'text', value: TAB_URL } },
      capture: { tabId: 1 },
    });
    expect(await screen.findByText('Starting…')).toBeTruthy();
    await jobItem('job-1').setValue({ id: 'job-1', status: 'uploading', startedAt: new Date().toISOString() });
    expect(await screen.findByText('Uploading screenshot…')).toBeTruthy();
    await jobItem('job-1').setValue({ id: 'job-1', status: 'creating', startedAt: new Date().toISOString() });
    expect(await screen.findByText('Saving to Notion…')).toBeTruthy();
    await jobItem('job-1').setValue({
      id: 'job-1',
      status: 'done',
      pageUrl: 'https://www.notion.so/page-1',
      startedAt: new Date().toISOString(),
    });
    expect(await screen.findByText('Saved to Resources')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in Notion/ }).getAttribute('href')).toBe('https://www.notion.so/page-1');
    expect(await lastJobItem.getValue()).toMatchObject({ jobId: 'job-1', url: TAB_URL, presetId: 'preset-1' });
    expect(await getLastPresetId()).toBe('preset-1');
  });

  it('"Save with another preset" returns to the form and re-checks duplicates', async () => {
    await jobItem('job-1').setValue({ id: 'job-1', status: 'done', pageUrl: 'https://www.notion.so/p', startedAt: '' });
    await startSaving();
    await userEvent.click(await screen.findByRole('button', { name: 'Save with another preset' }));
    expect(await screen.findByLabelText('Name')).toBeTruthy();
    await waitFor(() => {
      expect(requests('dup/check')).toHaveLength(2);
    });
  });

  it('resumes an in-flight job for the same page when reopened', async () => {
    await jobItem('job-9').setValue({ id: 'job-9', status: 'creating', startedAt: new Date().toISOString() });
    await lastJobItem.setValue({ jobId: 'job-9', presetId: 'preset-1', url: TAB_URL, mode: { kind: 'create' } });
    await setup();
    expect(await screen.findByText('Saving to Notion…')).toBeTruthy();
    expect(requests('save/start')).toHaveLength(0);
  });

  const routing: [NonNullable<AppError['action']>, string, RegExp][] = [
    ['open-setup', 'Open setup', /#\/setup$/],
    ['reshare-db', 'How to share', /#\/setup$/],
    ['edit-preset', 'Edit preset', /#\/presets\/preset-1$/],
  ];

  it.each(routing)('routes error action %s to the options page', async (action, label, url) => {
    routes['save/start'] = () => err('db-not-shared', 'Share the database with Sitecatch.', { action });
    await startSaving();
    await userEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => {
      expect(tabsCreate).toHaveBeenCalledWith({ url: expect.stringMatching(url) as unknown });
    });
    expect(windowClose).toHaveBeenCalled();
  });

  it('shows a job error and retries after re-checking duplicates', async () => {
    let attempts = 0;
    routes['save/start'] = () => {
      attempts += 1;
      return attempts === 1 ? err('network', 'You seem to be offline.', { action: 'retry' }) : ok({ jobId: 'job-2' });
    };
    await startSaving();
    expect(await screen.findByText('You seem to be offline.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(requests('save/start')).toHaveLength(2);
    });
    expect(requests('dup/check')).toHaveLength(2);
  });

  it('grant-permission calls permissions.request synchronously, then retries', async () => {
    const request = vi.spyOn(fakeBrowser.permissions, 'request').mockReturnValue(Promise.resolve(true) as never);
    let attempts = 0;
    routes['save/start'] = () => {
      attempts += 1;
      return attempts === 1
        ? err('no-host-permission', 'Allow Sitecatch to reach api.notion.com.', { action: 'grant-permission' })
        : ok({ jobId: 'job-2' });
    };
    await startSaving();
    const grant = await screen.findByRole('button', { name: 'Grant access' });
    fireEvent.click(grant);
    expect(request).toHaveBeenCalledExactlyOnceWith({ origins: ['https://api.notion.com/*'] });
    await waitFor(() => {
      expect(requests('save/start')).toHaveLength(2);
    });
  });

  it('shows a failed job’s error from the background', async () => {
    await jobItem('job-1').setValue({
      id: 'job-1',
      status: 'error',
      error: { code: 'invalid-token', message: 'Notion rejected your token.', action: 'open-setup' },
      startedAt: new Date().toISOString(),
    });
    await startSaving();
    expect(await screen.findByText('Notion rejected your token.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open setup' })).toBeTruthy();
  });
});
