import { expect, test } from './support/visual-test';
import { homeEmptyVisualSnapshot, homeVisualSnapshot } from './fixtures/home';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/home visual harness', () => {
  test('renders the populated action dashboard', async ({ page }) => {
    await installMockApi(page, { home: 'populated' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeVisualSnapshot);
  });

  test('renders the empty My Work state', async ({ page }) => {
    await installMockApi(page, { home: 'empty' });
    await page.goto('/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), homeEmptyVisualSnapshot);
  });
});
