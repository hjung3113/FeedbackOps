import { coverageSummaryFixture } from './fixtures/coverage';
import { coverageEmptyVisualSnapshot, coverageVisualSnapshot } from './fixtures/coverage';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/integration/coverage visual harness', () => {
  // Baseline PNGs are generated and inspected on a host with a browser, then
  // committed with the intended page-level visual change.
  test('renders the populated coverage page', async ({ page }) => {
    await installMockApi(page, { coverage: 'populated' });
    await page.goto('/integration/coverage');
    await expect(page.getByTestId('integration-coverage')).toBeVisible();
    await expect(page.getByTestId('coverage-row-voc-task')).toBeVisible();
    await expect(page.getByTestId('coverage-settings-link')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), coverageVisualSnapshot);
  });

  test('renders the empty-availability state', async ({ page }) => {
    await installMockApi(page, { coverage: 'empty' });
    await page.goto('/integration/coverage');
    await expect(page.getByTestId('integration-coverage')).toBeVisible();
    await expect(page.getByTestId('coverage-empty')).toBeVisible();
    await expect(page.getByTestId('coverage-settings-link')).toBeVisible();
    await expectVisual(page, page.locator('[data-app-frame]'), coverageEmptyVisualSnapshot);
  });
});

test('retains the last successful server computation time after refresh fails', async ({
  page,
}) => {
  await installMockApi(page, { coverage: 'populated' });
  let fail = false;
  await page.route('**/dashboard/summary?**', async (route) =>
    route.fulfill({
      status: fail ? 500 : 200,
      contentType: 'application/json',
      body: JSON.stringify(fail ? { code: 'internal.unexpected' } : coverageSummaryFixture),
    }),
  );
  await page.goto('/integration/coverage');
  await expect(page.getByTestId('recovery-freshness')).toContainText('2026-07-20 08:00:00 UTC');
  fail = true;
  await page.getByTestId('coverage-refresh').click();
  await expect(page.getByText('새로고침 실패 · 마지막 성공한 결과입니다.')).toBeVisible();
  await expectVisual(page, page.locator('[data-app-frame]'), 'coverage-stale-summary.png');
});
