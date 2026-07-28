import { expect, test } from './support/visual-test';
import { railScopeSnapshots } from './fixtures/rail-scope';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('rail and Managed System scope visual harness', () => {
  test('renders the VOC rail and all-systems scope', async ({ page }) => {
    await installMockApi(page, { railScope: true });
    await page.goto('/voc-clusters');
    await expect(page.getByTestId('rail-voc')).toHaveAttribute('aria-current', 'page');
    await expectVisual(page, page.locator('[data-app-frame]'), railScopeSnapshots[0]);
  });

  test('shows every Managed System option from the selector', async ({ page }) => {
    await installMockApi(page, { railScope: true });
    await page.goto('/voc-clusters');
    await page.getByTestId('scope-selector').click();
    await expect(page.getByText('Finance Analytics', { exact: true })).toBeVisible();
    await expectVisual(page, page.getByTestId('app-sidebar'), railScopeSnapshots[1]);
  });

  test('renders actor-private saved views without count badges', async ({ page }) => {
    await installMockApi(page, { railScope: true, savedViews: true });
    await page.goto('/voc-clusters');
    await expect(page.getByTestId('saved-views-section')).toBeVisible();
    await expectVisual(page, page.getByTestId('app-sidebar'), railScopeSnapshots[2]);
  });
});
