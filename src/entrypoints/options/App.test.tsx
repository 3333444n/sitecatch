import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/lib/errors';
import { App } from './App';
import { authStatus } from './lib/auth';
import { navigate, parseHash, resetRouterForTests } from './lib/router';
import { mockBackend, mockPermissionContains } from './test/mock-backend';

vi.mock('@/lib/messaging/client', () => ({ sendRequest: vi.fn() }));

beforeEach(() => {
  fakeBrowser.reset();
  resetRouterForTests();
  authStatus.value = null;
  mockPermissionContains(() => Promise.resolve(true));
});

afterEach(() => {
  cleanup();
});

describe('parseHash', () => {
  it.each([
    ['', { name: 'root' }],
    ['#/', { name: 'root' }],
    ['#/setup', { name: 'setup' }],
    ['#/presets', { name: 'presets' }],
    ['#/presets/', { name: 'presets' }],
    ['#/presets/new', { name: 'preset-new' }],
    ['#/presets/abc%20d', { name: 'preset', id: 'abc d' }],
    ['#/settings', { name: 'settings' }],
    ['#/help', { name: 'help' }],
    ['#/nope', { name: 'not-found', path: '/nope' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
});

describe('App routing', () => {
  it('opens setup by default when there is no token', async () => {
    mockBackend({ 'auth/status': () => ok({ hasToken: false, hostPermission: false }) });
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up Sitecatch' })).toBeTruthy();
    expect(location.hash).toBe('#/setup');
    expect(screen.getByRole('link', { name: 'Setup' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens presets by default when connected, and navigates between sections', async () => {
    mockBackend();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Presets' })).toBeTruthy();
    expect(await screen.findByText('No presets yet')).toBeTruthy();
    navigate('/help');
    expect(await screen.findByRole('heading', { level: 1, name: 'Help' })).toBeTruthy();
    navigate('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  });
});
