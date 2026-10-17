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

  test('shows the governance confirmation for a direct grant', async ({ page }) => {
    await installMockApi(page, { permissionGrantsScenario: 'direct-grant-form' });
    await page.goto('/admin/permissions/grants');

    await page.getByRole('button', { name: '권한 부여' }).click();
    const dialog = page.getByRole('dialog', { name: '권한 부여' });
    await dialog.getByRole('combobox', { name: '대상자' }).click();
    await page.getByRole('option', { name: 'Named Requester' }).click();
    await dialog.getByRole('combobox', { name: '부여 권한 및 범위' }).click();
    await page
      .getByRole('option', { name: '워크스페이스 관리자 권한 · 워크스페이스 전체' })
      .click();

    await expect(dialog).toContainText('Role Level은 변경되지 않습니다.');
    await expect(
      dialog.getByRole('checkbox', { name: /관리자 권한 부여를 확인/ }),
    ).not.toBeChecked();
    await expectVisual(page, dialog, 'direct-permission-grant-governance.png');
  });

  test('shows the Admin-recipient note for a direct grant', async ({ page }) => {
    await installMockApi(page, { permissionGrantsScenario: 'direct-grant-admin-form' });
    await page.goto('/admin/permissions/grants');

    await page.getByRole('button', { name: '권한 부여' }).click();
    const dialog = page.getByRole('dialog', { name: '권한 부여' });
    await dialog.getByRole('combobox', { name: '대상자' }).click();
    await page.getByRole('option', { name: 'Admin Two' }).click();
    await dialog.getByRole('combobox', { name: '부여 권한 및 범위' }).click();
    await page
      .getByRole('option', { name: '워크스페이스 관리자 권한 · 워크스페이스 전체' })
      .click();

    await expect(
      dialog.getByTestId('direct-grant-admin-note').getByText(/Admin은 이미 모든 권한을/),
    ).toBeVisible();
    await expect(dialog).toContainText('Role Level은 변경되지 않습니다.');
    await expectVisual(page, dialog, 'direct-permission-grant-admin-recipient.png');
  });
});
