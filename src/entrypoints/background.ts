import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void browser.runtime.openOptionsPage();
    }
  });

  // TODO(phase C): register the message router (src/background/router.ts).
});
