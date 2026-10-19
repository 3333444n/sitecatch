import { describe, expect, it } from 'vitest';
import { classifyUrl, FIREFOX_RESTRICTED_DOMAINS } from './restricted';

describe('classifyUrl', () => {
  it.each([
    'https://example.com/',
    'http://localhost:3000/app',
    'https://addons.mozilla.org.evil.example/',
    'https://mozilla.org/',
    'https://chrome.google.com/search',
    'https://example.com/report.pdf.html',
  ])('allows %s', (url) => {
    expect(classifyUrl(url)).toEqual({ restricted: false });
  });

  it.each([
    'about:newtab',
    'about:addons',
    'about:blank',
    'moz-extension://abc/options.html',
    'chrome://settings',
    'chrome-extension://abc/popup.html',
    'edge://extensions',
    'resource://gre/modules/x.js',
    'data:text/html,<p>hi</p>',
    'file:///Users/me/notes.html',
    'file:///Users/me/doc.pdf',
    'https://addons.mozilla.org/en-US/firefox/addon/x/',
    'https://accounts.firefox.com/settings',
    'https://support.mozilla.org/kb',
    'https://chromewebstore.google.com/detail/abc',
    'https://chrome.google.com/webstore/detail/abc',
    'https://microsoftedge.microsoft.com/addons/detail/x',
    'https://example.com/files/Report%20Q3.PDF',
    'https://example.com/paper.pdf?download=1#page=2',
    '',
    'not a url',
  ])('restricts %s', (url) => {
    const info = classifyUrl(url);
    expect(info.restricted).toBe(true);
    expect(info.reason).toBeTruthy();
  });

  it('covers every default Firefox restricted domain', () => {
    for (const host of FIREFOX_RESTRICTED_DOMAINS) {
      expect(classifyUrl(`https://${host}/`).restricted).toBe(true);
    }
    expect(FIREFOX_RESTRICTED_DOMAINS).toContain('addons.mozilla.org');
  });

  it('scopes store hosts by browser', () => {
    expect(classifyUrl('https://addons.mozilla.org/', 'chromium').restricted).toBe(false);
    expect(classifyUrl('https://chromewebstore.google.com/', 'firefox').restricted).toBe(false);
    expect(classifyUrl('https://addons.mozilla.org/', 'firefox').reason).toMatch(/Firefox/);
  });

  it('decodes the original URL from Reader View', () => {
    const info = classifyUrl('about:reader?url=https%3A%2F%2Fblog.example%2Fpost%3Fa%3D1%26b%3D2');
    expect(info).toMatchObject({ restricted: true, originalUrl: 'https://blog.example/post?a=1&b=2' });
    expect(info.reason).toMatch(/Reader View/);
    expect(classifyUrl('about:reader').originalUrl).toBeUndefined();
  });

  it('unwraps view-source:', () => {
    expect(classifyUrl('view-source:https://example.com/x')).toMatchObject({
      restricted: true,
      originalUrl: 'https://example.com/x',
    });
  });

  it('explains PDFs specifically', () => {
    expect(classifyUrl('https://example.com/a.pdf').reason).toMatch(/PDF/);
  });
});
