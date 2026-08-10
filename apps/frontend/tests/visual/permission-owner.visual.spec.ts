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

    await page.getByRole('button', { name: 'Request access' }).click();

    const dialog = page.getByTestId('permission-request-dialog');
    // The point of #274 is that the request is composed, not fired on click:
    // the reason and duration inputs must be on screen before anything is sent.
    await expect(dialog.getByTestId('permission-request-reason')).toBeVisible();
    await expect(dialog.getByTestId('permission-request-expiration')).toBeVisible();

    await expectVisual(page, dialog, 'permission-request-compose.png');
  });

  test('ms-register-with-owner', async ({ page }) => {
    await installMockApi(page, { managedSystemOwner: true, role: 'admin' });
    await page.goto('/admin/managed-systems');

    await page.getByTestId('ms-register-button').click();

    const dialog = page.getByTestId('ms-register-dialog');
    await expect(dialog.getByTestId('create-default-owner')).toBeVisible();

    await expectVisual(page, dialog, 'ms-register-with-owner.png');
  });
});
