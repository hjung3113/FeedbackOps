import { expect, test as base } from '@playwright/test';

// `reducedMotion` is page media emulation in the installed Playwright API.
// Apply it before each navigation, alongside the config-level browser context defaults.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await use(page);
  },
});

export { expect };
