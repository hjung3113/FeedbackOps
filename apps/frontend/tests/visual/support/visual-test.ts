import { expect, test as base } from '@playwright/test';

// Fixtures carry absolute timestamps, but screens render them as Korean
// relative time off `Date.now()` (see `formatVocCreatedAt`), so an unpinned
// baseline encodes the date it was captured on: the #179 baseline read
// "3시간 전" when taken and "8일 전" by the time #201 regenerated it.
// That drift alone stays under `expectVisual`'s diff threshold, so it does not
// redden the gate by itself — it just makes baselines unreproducible and eats
// budget that a real regression should be spending. Pinned just after the
// newest fixture timestamp (2026-07-18) so relative labels stay plausible.
const FIXED_CLOCK = new Date('2026-07-21T09:00:00.000Z');

// `reducedMotion` is page media emulation in the installed Playwright API.
// Apply it before each navigation, alongside the config-level browser context defaults.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_CLOCK);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await use(page);
  },
});

export { expect };
