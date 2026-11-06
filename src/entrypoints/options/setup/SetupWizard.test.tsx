import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/lib/errors';
import { connectionsStatus } from '../lib/connections';
import { resetRouterForTests } from '../lib/router';
import { ACME, connList, DS_RESOURCES, fail, GLOBEX, mockBackend, mockPermissionContains, mockPermissionRequest } from '../test/mock-backend';
import { DatabaseList } from './DatabaseList';
import { SetupWizard, stepsFor } from './SetupWizard';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));

function grantState(granted: boolean) {
  mockPermissionContains(() => Promise.resolve(granted));
}

async function continueTo(heading: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  await screen.findByRole('heading', { level: 2, name: heading });
}

beforeEach(() => {
  fakeBrowser.reset();
  resetRouterForTests();
  connectionsStatus.value = { hostPermission: false, connections: [] };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('setup wizard: choosing a method', () => {
  it('defaults to the personal access token (recommended) with 5 steps', async () => {
    grantState(false);
    mockBackend();
    render(<SetupWizard />);
    const pat = screen.getByRole('radio', { name: /Personal access token/ });
    expect(pat.getAttribute('aria-checked')).toBe('true');
    expect(within(pat).getByText('Recommended')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Setup progress' })).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText('Share your databases')).toBeNull();

    await continueTo(/Create the token/);
    expect(screen.getAllByText('New token').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /notion.so\/developers\/tokens/ }).getAttribute('href')).toBe(
      'https://www.notion.so/developers/tokens',
    );
    expect(screen.getByText('Notion shows the token only once')).toBeTruthy();
  });

  it('adds the share step and connection instructions for an internal connection', async () => {
    grantState(false);
    mockBackend();
    render(<SetupWizard />);
    await userEvent.click(screen.getByRole('radio', { name: /Internal connection/ }));
    expect(screen.getByRole('radio', { name: /Internal connection/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(screen.getByRole('list', { name: 'Setup progress' })).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('Share your databases')).toBeTruthy();

    await continueTo(/Create the token/);
    expect(screen.getByText('You need to be a Workspace Owner')).toBeTruthy();
    expect(screen.getByText('Internal connections')).toBeTruthy();
    expect(screen.getByText('Insert content')).toBeTruthy();
  });

  it('lists the steps per method', () => {
    expect(stepsFor('personal')).not.toContain('share');
    expect(stepsFor('connection')).toContain('share');
  });
});

describe('setup wizard: host permission', () => {
  it('calls permissions.request synchronously inside the click handler', async () => {
    grantState(false);
    mockBackend();
    let resolve: (v: boolean) => void = () => undefined;
    const request = mockPermissionRequest(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    render(<SetupWizard />);
    await continueTo(/Create the token/);
    await continueTo(/Allow access to Notion/);

    const button = screen.getByRole('button', { name: 'Grant access to api.notion.com' });
    fireEvent.click(button);
    // Synchronous: called before any microtask runs.
    expect(request).toHaveBeenCalledExactlyOnceWith({ origins: ['https://api.notion.com/*'] });

    resolve(true);
    expect(await screen.findByText('Access granted')).toBeTruthy();
  });

  it('explains a denied prompt', async () => {
    grantState(false);
    mockBackend();
    mockPermissionRequest(() => Promise.resolve(false));
    render(<SetupWizard />);
    await continueTo(/Create the token/);
    await continueTo(/Allow access/);
    await userEvent.click(screen.getByRole('button', { name: 'Grant access to api.notion.com' }));
    expect(await screen.findByText('Access wasn’t granted')).toBeTruthy();
  });

  it('skips the permission step when access is already granted', async () => {
    grantState(true);
    mockBackend();
    render(<SetupWizard />);
    await waitFor(() => {
      expect(browser.permissions.contains).toHaveBeenCalled();
    });
    await continueTo(/Create the token/);
    await continueTo(/Paste your token/);
  });
});

describe('setup wizard: token validation', () => {
  async function openTokenStep() {
    grantState(true);
    render(<SetupWizard />);
    await waitFor(() => {
      expect(browser.permissions.contains).toHaveBeenCalled();
    });
    await continueTo(/Create the token/);
    await continueTo(/Paste your token/);
  }

  it('validates the token and shows workspace and bot name', async () => {
    const send = mockBackend({
      'conn/add': () => ok({ ...ACME, botName: 'Kicke’s token', workspaceName: 'Acme HQ' }),
    });
    await openTokenStep();
    const input = screen.getByLabelText('Personal access token');
    expect(input.getAttribute('type')).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.getAttribute('type')).toBe('text');

    await userEvent.type(input, 'ntn_secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Check token' }));
    expect(await screen.findByText('Acme HQ')).toBeTruthy();
    expect(screen.getByText('Kicke’s token')).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'conn/add', token: 'ntn_secret123', tokenKind: 'personal' });
    expect(screen.getByRole('button', { name: /^Continue/ })).toHaveProperty('disabled', false);
  });

  it('validates immediately on paste', async () => {
    const send = mockBackend({ 'conn/add': () => ok({ ...ACME, botName: 'Bot', workspaceName: 'Pasted WS' }) });
    await openTokenStep();
    const input = screen.getByLabelText('Personal access token');
    fireEvent.paste(input, { clipboardData: { getData: () => ' ntn_pasted ' } });
    expect(await screen.findByText('Pasted WS')).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'conn/add', token: 'ntn_pasted', tokenKind: 'personal' });
  });

  it('shows an actionable error when Notion rejects the token', async () => {
    mockBackend({
      'conn/add': () =>
        fail({ code: 'invalid-token', message: 'Notion rejected your token.', action: 'open-setup', detail: 'HTTP 401' }),
    });
    await openTokenStep();
    await userEvent.type(screen.getByLabelText('Personal access token'), 'ntn_wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Check token' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Notion rejected this token');
    expect(alert.textContent).toContain('Notion rejected your token.');
    expect(screen.getByText(/shown only once, so you may need to create a new one/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Continue/ })).toHaveProperty('disabled', true);
  });
});

describe('setup wizard: databases', () => {
  it('shows the workspaces overview when connected, with databases, and removes a workspace', async () => {
    grantState(true);
    connectionsStatus.value = { hostPermission: true, connections: [{ ...ACME, tokenKind: 'connection' }] };
    const send = mockBackend({
      'ds/list': () => ok([DS_RESOURCES]),
      'conn/list': connList([]),
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<SetupWizard />);
    expect(screen.getByRole('heading', { level: 1, name: 'Workspaces' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Acme' })).toBeTruthy();
    expect(screen.getByText(/Internal connection · as Sitecatch/)).toBeTruthy();
    // A single workspace's databases are shown right away.
    expect(await screen.findByText('Resources')).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'ds/list', connectionId: 'ws-acme' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove Acme' }));
    expect(send).toHaveBeenCalledWith({ type: 'conn/remove', connectionId: 'ws-acme' });
  });

  it('“Add workspace” runs the wizard and comes back to the overview', async () => {
    grantState(true);
    connectionsStatus.value = { hostPermission: true, connections: [ACME] };
    mockBackend({ 'ds/list': () => ok([]) });
    render(<SetupWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Add workspace' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Add a workspace' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Choose how to connect/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '← Workspaces' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Workspaces' })).toBeTruthy();
  });

  it('“Replace token” opens the token step for that workspace and warns when the token is for another one', async () => {
    grantState(true);
    connectionsStatus.value = { hostPermission: true, connections: [ACME, GLOBEX] };
    const send = mockBackend({ 'conn/add': () => ok({ ...GLOBEX, id: 'ws-other', workspaceName: 'Other' }) });
    render(<SetupWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Replace token for Globex' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Replace the token for “Globex”' })).toBeTruthy();
    await userEvent.type(screen.getByLabelText('API token'), 'ntn_x');
    await userEvent.click(screen.getByRole('button', { name: 'Check token' }));
    expect(send).toHaveBeenCalledWith({ type: 'conn/add', token: 'ntn_x', tokenKind: 'connection' });
    expect(await screen.findByText('That token is for another workspace')).toBeTruthy();
  });
});

describe('DatabaseList', () => {
  it('shows PAT troubleshooting when no databases are visible', async () => {
    mockBackend({ 'ds/list': () => ok([]) });
    render(<DatabaseList connectionId="ws-acme" tokenKind="personal" />);
    expect(await screen.findByText('No databases yet')).toBeTruthy();
    expect(screen.getByText('Can’t see your database?')).toBeTruthy();
    expect(screen.getByText(/Wrong workspace/)).toBeTruthy();
    expect(screen.getByText(/You don’t have access to it/)).toBeTruthy();
    expect(screen.queryByText(/Not shared with the connection yet/)).toBeNull();
  });

  it('shows connection troubleshooting (sharing) for internal connections', async () => {
    mockBackend({ 'ds/list': () => ok([]) });
    render(<DatabaseList connectionId="ws-acme" tokenKind="connection" />);
    expect(await screen.findByText(/Not shared with the connection yet/)).toBeTruthy();
    expect(screen.getByText(/shared parent page/)).toBeTruthy();
    expect(screen.getByText(/Token revoked or refreshed/)).toBeTruthy();
  });

  it('searches and refreshes via ds/list', async () => {
    const send = mockBackend({
      'ds/list': (req) => ok(req.query === 'fav' ? [{ id: 'ds-fav', name: 'Fav websites' }] : [DS_RESOURCES]),
    });
    render(<DatabaseList connectionId="ws-acme" tokenKind="personal" searchDelayMs={0} />);
    expect(await screen.findByText('Resources')).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search databases' }), 'fav');
    expect(await screen.findByText('Fav websites')).toBeTruthy();
    expect(send).toHaveBeenCalledWith({ type: 'ds/list', connectionId: 'ws-acme', query: 'fav' });
    send.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(send).toHaveBeenCalledWith({ type: 'ds/list', connectionId: 'ws-acme', query: 'fav' });
  });

  it('picks a database when onPick is given', async () => {
    mockBackend({ 'ds/list': () => ok([DS_RESOURCES]) });
    const onPick = vi.fn();
    render(<DatabaseList connectionId="ws-acme" tokenKind="personal" onPick={onPick} />);
    await userEvent.click(await screen.findByRole('button', { name: /Resources/ }));
    expect(onPick).toHaveBeenCalledWith(DS_RESOURCES);
  });
});
