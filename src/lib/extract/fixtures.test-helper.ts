/**
 * Test-only helpers: load HTML fixtures into an isolated happy-dom Window and
 * run the probe *from its source text*, the way `scripting.executeScript`
 * serializes it. Any accidental closure/import makes these runs throw.
 */
import { Window } from 'happy-dom';
import bareHtml from '../../../test/fixtures/pages/bare.html?raw';
import relativeHtml from '../../../test/fixtures/pages/relative.html?raw';
import richHtml from '../../../test/fixtures/pages/rich.html?raw';
import { pageProbe } from './probe';
import type { RawPageData } from './types';

export const FIXTURES = { rich: richHtml, bare: bareHtml, relative: relativeHtml } as const;

export function loadPage(html: string, url: string): Window {
  const win = new Window({
    url,
    settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true },
  });
  win.document.write(html);
  return win;
}

/** Re-creates `fn` from its source in a scope where only the page globals exist. */
export function fromSource<F extends (...args: never[]) => unknown>(fn: F, win: Window): F {
  // Intentional: mimic executeScript's serialize-and-evaluate of `func`.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    'window',
    'document',
    'location',
    'getComputedStyle',
    'setTimeout',
    'clearTimeout',
    `"use strict"; return (${fn.toString()});`,
  ) as (...globals: unknown[]) => F;
  return factory(
    win,
    win.document,
    win.location,
    win.getComputedStyle.bind(win),
    win.setTimeout.bind(win),
    win.clearTimeout.bind(win),
  );
}

export function probeFixture(name: keyof typeof FIXTURES, url: string): RawPageData {
  const win = loadPage(FIXTURES[name], url);
  try {
    return fromSource(pageProbe, win)();
  } finally {
    void win.happyDOM.close();
  }
}
