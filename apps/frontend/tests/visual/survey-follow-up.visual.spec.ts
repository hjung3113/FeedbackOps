import { surveyFollowUpVisualFixture } from './fixtures/survey-follow-up';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('/surveys/:surveyId/follow-up visual harness', () => {
  test('renders the holder list with the first open response detail selected', async ({ page }) => {
    await installMockApi(page, { surveyFollowUp: true, role: 'admin' });
    await page.goto(`/surveys/${surveyFollowUpVisualFixture.id}/follow-up`);

    await expect(page.getByTestId('survey-follow-up-review')).toBeVisible();
    await expect(page.getByTestId('follow-up-row-4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('follow-up-detail-panel')).toBeVisible();
    await expectVisual(page, page.locator('body'), 'survey-follow-up-populated.png');
  });

  test('renders the required-reason mark dialog', async ({ page }) => {
    await installMockApi(page, { surveyFollowUp: true, role: 'admin' });
    await page.goto(`/surveys/${surveyFollowUpVisualFixture.id}/follow-up`);
    await expect(page.getByTestId('survey-follow-up-review')).toBeVisible();
    await page.getByRole('button', { name: '후속 조치 없음…' }).click();

    await expect(page.getByTestId('follow-up-mark-dialog')).toBeVisible();
    await expect(page.getByTestId('follow-up-decision-reason')).toBeVisible();
    await expectVisual(page, page.locator('body'), 'survey-follow-up-mark-dialog.png');
  });
});
