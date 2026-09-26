import { coverageVisualSnapshot } from './fixtures/coverage';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/integration/coverage visual harness', () => {
  // Baseline PNG is captured on a host with a browser (coordinator-owned);
  // this commit ships the spec + schema-validated fixture only.
  test('renders the populated coverage page', async ({ page }) => {
    await installMockApi(page, { coverage: true });
    await page.goto('/integration/coverage');
    await expect(page.getByTestId('integration-coverage')).toBeVisible();
    await expect(page.getByTestId('coverage-row-voc-task')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), coverageVisualSnapshot);
  });
});
