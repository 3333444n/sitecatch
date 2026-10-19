import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createDefaultDeps } from '@/background/context';
import { createHandlers } from '@/background/handlers';
import { registerRouter } from '@/background/router';

export default defineBackground(() => {
  // Registered synchronously so the listeners exist whenever the background wakes up.
  registerRouter(createHandlers(createDefaultDeps()));

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void browser.runtime.openOptionsPage();
    }
  });
});
