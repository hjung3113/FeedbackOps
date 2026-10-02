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
    await expect(dialog.getByRole('combobox', { name: '공개 상태' })).toContainText('상태 선택');
    await page.evaluate(() => document.fonts.ready);
    // FullDetailView owns this independent scroll container; normalize it after fonts settle.
    await page
      .locator('[data-testid="voc-detail-panel"] > .overflow-y-auto')
      .evaluate((container) => {
        container.scrollTop = 0;
      });
    await expectVisual(page, dialog, 'voc-public-update-review-empty-status.png');
  });

  test('captures dismissal-with-reason state', async ({ page }) => {
    await installMockApi(page, { vocReview: true });
    await page.goto(`/vocs?view=inbox&selected=${VOC_REVIEW_IDS.voc}`);
    await page.getByTestId('public-update-review-button').click();
    const dialog = page.getByTestId('public-update-review-modal');
    await dialog.getByLabel('기각 사유').fill('릴리스 공지는 별도 검토가 필요합니다.');
    await expect(dialog.getByRole('button', { name: '기각' })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator('[data-testid="voc-detail-panel"] > .overflow-y-auto')
      .evaluate((container) => {
        container.scrollTop = 0;
      });
    await expectVisual(page, dialog, 'voc-public-update-review-dismiss-reason.png');
  });
});
