// Visual states for #274 (explicit permission-request composition) and
// #278 (Managed System default owner selection).
//
// The mock scenarios these drive live in support/mock-api.ts:
//   permissionRequestCompose — /me/permissions/check returns `request_access`,
//                              so the gate offers Request access instead of
//                              silently allowing the surface.
//   managedSystemOwner       — /actors returns named owner candidates and
//                              /managed-systems returns the owner-bearing list.

import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('permission request composition and Managed System owner', () => {
  test('permission-request-compose', async ({ page }) => {
    await installMockApi(page, { permissionRequestCompose: true, role: 'user' });
    await page.goto('/admin/managed-systems');

    await page.getByRole('button', { name: '권한 요청' }).click();

    const dialog = page.getByTestId('permission-request-dialog');
    // The point of #274 is that the request is composed, not fired on click:
    // the reason and duration inputs must be on screen before anything is sent.
    await expect(dialog.getByTestId('permission-request-reason')).toBeVisible();
    await expect(dialog.getByTestId('permission-request-expiration')).toBeVisible();

    await expectVisual(page, dialog, 'permission-request-compose.png');
  });

  test('ms-registry-diagnostics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await installMockApi(page, { managedSystemDiagnostics: true, role: 'admin' });
    await page.goto('/admin/managed-systems');
    await expect(page.getByText('현재 설정', { exact: true })).toBeVisible();
    await expect(
      page.getByText('생성 시 기본 배정 실패 12건 · 마지막 2026. 7. 20. 오후 5:45', {
        exact: true,
      }),
    ).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'Analytics Operations Managed System 설정 열기' }),
    ).toHaveCount(4);
    await expectVisual(
      page,
      page.getByTestId('managed-systems-registry'),
      'ms-registry-diagnostics.png',
    );
  });

  test('ms-register-with-owner', async ({ page }) => {
    await installMockApi(page, { managedSystemOwner: true, role: 'admin' });
    await page.goto('/admin/managed-systems');

    await page.getByTestId('ms-register-button').click();

    const dialog = page.getByTestId('ms-register-dialog');
    await expect(dialog.getByTestId('create-default-owner')).toBeVisible();
    await expect(dialog.getByTestId('create-default-reviewer')).toBeVisible();

    await expectVisual(page, dialog, 'ms-register-with-owner.png');
  });

  test('ms-archive-confirm', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await installMockApi(page, { managedSystemDiagnostics: true, role: 'admin' });
    await page.goto('/admin/managed-systems');
    await page.getByTestId('ms-configure-diagnostics-system').click();
    await page.getByTestId('archive-diagnostics-system').click();

    const dialog = page.getByTestId('archive-diagnostics-system-confirm-dialog');
    await expect(dialog).toContainText('보관할까요?');
    await expect(dialog).toContainText('Analytics Operations Managed System');
    await expectVisual(page, dialog, 'ms-archive-confirm.png');
  });

  test('aa-archive-confirm', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await installMockApi(page, { managedSystemDiagnostics: true, role: 'admin' });
    // Registered after the shared mock, so it answers first for this one list read.
    await page.route(
      (url) => url.pathname.endsWith('/analytics-areas'),
      (route) =>
        route.request().method() !== 'GET' || route.request().resourceType() === 'document'
          ? route.fallback()
          : route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                items: [
                  {
                    id: '44444444-4444-4444-8444-444444441184',
                    managed_system_id: '22222222-2222-4222-8222-222222221146',
                    slug: 'archive-area',
                    name: 'Archive Visual Area',
                    owner_team_id: null,
                    created_at: '2026-07-18T00:00:00.000Z',
                    archived_at: null,
                  },
                ],
                total: 1,
              }),
            }),
    );
    await page.goto('/admin/analytics-areas');
    await page.getByTestId('aa-detail-archive-area').click();
    await page.getByTestId('aa-edit-button').click();
    await page.getByTestId('aa-archive-archive-area').click();

    const dialog = page.getByTestId('aa-archive-archive-area-confirm-dialog');
    await expect(dialog).toContainText('Archive Visual Area');
    await expectVisual(page, dialog, 'aa-archive-confirm.png');
  });
});
