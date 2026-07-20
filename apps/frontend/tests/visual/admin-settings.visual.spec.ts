import { expect, test } from './support/visual-test';

import { adminSettingsVisualScenarios } from './fixtures/admin-settings';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/admin/settings visual harness', () => {
  for (const scenario of adminSettingsVisualScenarios) {
    test(`renders ${scenario}`, async ({ page }) => {
      await installMockApi(page, {
        adminSettingsScenario: scenario,
        role: scenario === 'no-permission' ? 'user' : 'admin',
      });
      await page.goto('/admin/settings');

      if (scenario === 'no-permission') {
        const target = page.locator('[data-permission-state="blocked_non_requestable"]');
        await expect(target).toBeVisible();
        await expectVisual(page, target, 'admin-settings-no-permission.png');
        return;
      }

      if (scenario === 'error') {
        const target = page.getByTestId('workspace-settings-error');
        await expect(target).toBeVisible();
        await expectVisual(page, target, 'admin-settings-error.png');
        return;
      }

      const target = page.getByTestId('workspace-settings-screen');
      await expect(target).toBeVisible();
      if (scenario === 'editing') {
        await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
        await page.getByLabel('Anonymity threshold').fill('12');
        await expect(page.getByTestId('workspace-settings-save-bar')).toBeVisible();
      }
      if (scenario === 'locked') {
        await expect(target.getByText('Locked', { exact: true })).toHaveCount(5);
        const surveyResponseToVocRow = target
          .getByText('Survey Response → VOC', { exact: true })
          .locator('..')
          .locator('..');
        await expect(surveyResponseToVocRow.getByText('Forbidden', { exact: true })).toBeVisible();
      }
      await expectVisual(page, target, `admin-settings-${scenario}.png`);
    });
  }
});
