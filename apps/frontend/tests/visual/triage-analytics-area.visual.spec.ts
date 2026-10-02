import { TRIAGE_AREA_IDS } from './fixtures/triage-analytics-area';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('Triage Analytics Area visual states', () => {
  test('triage-analytics-area-populated', async ({ page }) => {
    await installMockApi(page, { triageAreaScenario: 'triage-analytics-area-populated' });
    await page.goto('/vocs?view=triage');

    const currentArea = page.getByRole('radio', { name: 'Marketing Attribution' });
    await expect(currentArea).toHaveAttribute('data-state', 'on');
    await expectVisual(
      page,
      page.locator('[data-app-frame]'),
      'triage-analytics-area-populated.png',
    );
  });

  test('create-finding-area-inherited', async ({ page }) => {
    await installMockApi(page, { triageAreaScenario: 'create-finding-area-inherited' });
    await page.goto(`/vocs?view=inbox&selected=${TRIAGE_AREA_IDS.voc}`);
    // #669 made Finding 생성 the VOC footer's primary button (no overflow menu).
    await page
      .getByRole('complementary', { name: '상세 패널' })
      .getByRole('button', { name: 'Finding 생성' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Finding 생성' });
    await expect(dialog.getByRole('radio', { name: 'Marketing Attribution' })).toHaveAttribute(
      'data-state',
      'on',
    );
    await expectVisual(page, dialog, 'create-finding-area-inherited.png');
  });
});
