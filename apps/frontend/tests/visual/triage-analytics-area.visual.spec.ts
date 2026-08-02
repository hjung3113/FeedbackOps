import { installMockApi } from '../support/mock-api';
import { expectVisual } from '../support/screenshot';
import { expect, test } from '../support/visual-test';
import { TRIAGE_AREA_IDS } from './fixtures/triage-analytics-area';

test.describe('Chunk B Analytics Area visual states', () => {
  test('triage-analytics-area-populated', async ({ page }) => {
    await installMockApi(page, { chunkBScenario: 'triage-analytics-area-populated' });
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
    await installMockApi(page, { chunkBScenario: 'create-finding-area-inherited' });
    await page.goto(`/vocs?view=inbox&selected=${TRIAGE_AREA_IDS.voc}`);
    await page.getByRole('button', { name: 'Finding 생성' }).click();

    const dialog = page.getByRole('dialog', { name: 'Finding 생성' });
    await expect(dialog.getByRole('radio', { name: 'Marketing Attribution' })).toHaveAttribute(
      'data-state',
      'on',
    );
    await expectVisual(page, dialog, 'create-finding-area-inherited.png');
  });
});
