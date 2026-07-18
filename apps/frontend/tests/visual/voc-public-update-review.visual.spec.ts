import { expect, test } from './support/visual-test';

import { VOC_REVIEW_IDS } from './fixtures/voc-public-update-review';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('VOC public-update review visual harness (#180)', () => {
  test('shows the populated review badge and opens with no reporter status preselected', async ({
    page,
  }) => {
    await installMockApi(page, { vocReview: true });
    await page.goto(`/vocs?view=inbox&selected=${VOC_REVIEW_IDS.voc}`);

    const button = page.getByTestId('public-update-review-button');
    await expect(button).toContainText('리뷰');
    await expect(button).toContainText('1');
    await button.click();

    const dialog = page.getByTestId('public-update-review-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select').nth(1)).toHaveValue('');
    await expectVisual(page, dialog, 'voc-public-update-review-empty-status.png');
  });

  test('captures dismissal-with-reason state', async ({ page }) => {
    await installMockApi(page, { vocReview: true });
    await page.goto(`/vocs?view=inbox&selected=${VOC_REVIEW_IDS.voc}`);
    await page.getByTestId('public-update-review-button').click();
    const dialog = page.getByTestId('public-update-review-modal');
    await dialog.getByLabel('Dismiss reason').fill('릴리스 공지는 별도 검토가 필요합니다.');
    await expect(dialog.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    await expectVisual(page, dialog, 'voc-public-update-review-dismiss-reason.png');
  });
});
