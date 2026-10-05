import { expect, test } from './support/visual-test';

import { PERMISSION_GRANTS_IDS } from './fixtures/permission-grants';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/admin/permissions/grants visual harness', () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test('shows an active grant with its detail panel', async ({ page }) => {
    await installMockApi(page, { permissionGrantsScenario: 'populated' });
    await page.goto(`/admin/permissions/grants?selected=${PERMISSION_GRANTS_IDS.grant}`);

    const list = page.getByTestId('permission-grants-list');
    const detail = page.getByTestId('permission-grants-detail-panel');
    await expect(list.getByText('Named Requester · VOC Triage', { exact: true })).toBeVisible();
    await expect(detail).toContainText('권한 취소');
    await expectVisual(
      page,
      page.locator('[data-shell="list"]'),
      'active-permission-grant-selected.png',
    );
  });

  test('shows an active deny with its detail panel', async ({ page }) => {
    await installMockApi(page, { permissionGrantsScenario: 'populated' });
    await page.goto(`/admin/permissions/grants?tab=denies&selected=${PERMISSION_GRANTS_IDS.deny}`);

    const list = page.getByTestId('permission-grants-list');
    const detail = page.getByTestId('permission-grants-detail-panel');
    await expect(list.getByText('Admin Two · Finding 관리', { exact: true })).toBeVisible();
    await expect(detail).toContainText('차단 해제');
    await expectVisual(
      page,
      page.locator('[data-shell="list"]'),
      'active-permission-deny-selected.png',
    );
  });

  test('shows the empty state', async ({ page }) => {
    await installMockApi(page, { permissionGrantsScenario: 'empty' });
    await page.goto('/admin/permissions/grants');

    const emptyState = page.getByText('표시할 항목이 없습니다.', { exact: true });
    await expect(emptyState).toBeVisible();
    await expectVisual(page, emptyState, 'active-permissions-empty.png');
  });
});
