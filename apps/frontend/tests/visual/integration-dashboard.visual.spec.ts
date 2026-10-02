import {
  integrationDashboardDeniedVisualSnapshot,
  integrationDashboardEmptyVisualSnapshot,
  integrationDashboardVisualSnapshot,
} from './fixtures/integration-dashboard';
import { createIntegrationDashboardScenario } from './scenarios';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/integration action dashboard visual harness', () => {
  test('renders the populated action dashboard and active sidebar entry', async ({ page }) => {
    await installMockApi(page, {
      integrationDashboard: createIntegrationDashboardScenario('populated'),
    });
    await page.goto('/integration');
    await expect(page.getByRole('heading', { level: 1, name: '연동 액션 대시보드' })).toBeVisible();
    await expect(page.getByTestId('integration-queue-card-unassigned-voc')).toBeVisible();
    await expect(page.getByTestId('integration-managed-system-table')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-integration-dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectVisual(page, page.locator('[data-app-frame]'), integrationDashboardVisualSnapshot);
  });

  test('renders the successful all-empty summary state', async ({ page }) => {
    await installMockApi(page, {
      integrationDashboard: createIntegrationDashboardScenario('empty'),
    });
    await page.goto('/integration');
    await expect(page.getByText('이 범위에서 표시할 큐가 없습니다.')).toBeVisible();
    await expect(page.getByTestId('integration-surface-coverage-stat')).toHaveCount(0);
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      integrationDashboardEmptyVisualSnapshot,
    );
  });

  test('renders a permission-denied summary as a blocked panel', async ({ page }) => {
    await installMockApi(page, {
      integrationDashboard: createIntegrationDashboardScenario('permission-denied'),
    });
    await page.goto('/integration');
    await expect(
      page.getByTestId('integration-dashboard-blocked').locator('[data-state="denied"]'),
    ).toBeVisible();
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      integrationDashboardDeniedVisualSnapshot,
    );
  });
});
