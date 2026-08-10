import { expect, test } from './support/visual-test';

import { VOC_CREATE_IDS } from './fixtures/voc-create';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('VOC create pre-submit similar VOC visual harness (#293)', () => {
  test('shows selected Managed System peers in the create right column', async ({ page }) => {
    await installMockApi(page, { vocCreate: true, role: 'user' });
    await page.goto(`/vocs?action=create&managedSystem=${VOC_CREATE_IDS.managedSystem}`);

    const panel = page.getByTestId('similar-voc-panel');
    await expect(panel).toContainText('유사 VOC');
    await expect(panel).toContainText('2건');
    await expect(panel).toContainText('Tableau 새로고침 실패');
    await expect(panel).toContainText('VOC-2931');
    await expectVisual(page, page.locator('#voc-create-form').locator('..').locator('..'), 'voc-create.png');
  });
});
