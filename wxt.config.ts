import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: ({ browser }) => ({
    name: 'Sitecatch',
    description: 'Collect websites into your Notion databases.',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://api.notion.com/*'],
    action: {
      default_title: 'Sitecatch',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              // Placeholder: finalize before the first signed AMO build (immutable afterwards).
              id: 'sitecatch@sitecatch.app',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['browsingActivity', 'websiteContent'],
              },
            },
            // data_collection_permissions needs Firefox for Android >= 142.
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  }),
});
