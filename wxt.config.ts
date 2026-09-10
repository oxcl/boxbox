import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => {
    if (browser === 'firefox') {
      return {
        homepage_url: 'https://oxcl.github.io/boxbox',
        permissions: ['contextualIdentities', 'cookies', 'tabs', 'storage', 'webNavigation'],
        browser_specific_settings: {
          gecko: {
            id: '@oxcl.boxbox',
            data_collection_permissions: {
              required: ['none'],
            },
          },
        },
      };
    }

    return {
      homepage_url: 'https://oxcl.github.io/boxbox',
      permissions: ['cookies', 'tabs', 'storage', 'webNavigation', 'webRequest'],
      host_permissions: ['*://*/*'],
    };
  },
});
