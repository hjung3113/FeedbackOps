import { coverageEmptyVisualSnapshot, coverageVisualSnapshot } from './fixtures/coverage';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/integration/coverage visual harness', () => {
  // Baseline PNGs are captured on a host with a browser (coordinator-owned);
  // this commit ships the spec + schema-validated fixtures only.
  test('renders the populated coverage page', async ({ page }) => {
    await installMockApi(page, { coverage: 'populated' });
    await page.goto('/integration/coverage');
    await expect(page.getByTestId('integration-coverage')).toBeVisible();
    await expect(page.getByTestId('coverage-row-voc-task')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), coverageVisualSnapshot);
  });

  test('renders the empty-availability state', async ({ page }) => {
    await installMockApi(page, { coverage: 'empty' });
    await page.goto('/integration/coverage');
    await expect(page.getByTestId('integration-coverage')).toBeVisible();
    await expect(page.getByTestId('coverage-empty')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), coverageEmptyVisualSnapshot);
  });
});
