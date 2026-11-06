import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { migrateLegacyAuth } from '@/background/connections';
import { createDefaultDeps } from '@/background/context';
import { createHandlers } from '@/background/handlers';
import { registerRouter } from '@/background/router';

export default defineBackground(() => {
  // Registered synchronously so the listeners exist whenever the background wakes up.
  registerRouter(createHandlers(createDefaultDeps()));
  // v0.1 single token → connections. Idempotent; every connections read also runs it first.
  void migrateLegacyAuth().catch((thrown: unknown) => {
    console.error('[sitecatch] connections migration failed', thrown instanceof Error ? thrown.message : 'unknown');
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void browser.runtime.openOptionsPage();
    }
  });
});
