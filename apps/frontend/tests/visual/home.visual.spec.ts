import {
  homeEmptyVisualSnapshot,
  homeVisualSnapshot,
  inboxHighNoLinkSelectedVisualSnapshot,
} from './fixtures/home';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/home visual harness', () => {
  test('renders the populated action dashboard', async ({ page }) => {
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeVisualSnapshot);
  });

  // #280 removed the dead My Work entry point, not the panel — the panel still
  // renders assigned Tasks and pending Requests, and this is its empty state.
  test('renders the empty assigned-work state', async ({ page }) => {
    await installMockApi(page, { home: 'empty' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeEmptyVisualSnapshot);
  });

  test('inbox-high-no-link-selected', async ({ page }) => {
    await installMockApi(page, { inboxHighNoLink: true });
    await page.goto('/vocs?view=inbox&tab=high-no-link');
    const tab = page.getByRole('tab', { name: 'High · no link' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      inboxHighNoLinkSelectedVisualSnapshot,
    );
  });
});
