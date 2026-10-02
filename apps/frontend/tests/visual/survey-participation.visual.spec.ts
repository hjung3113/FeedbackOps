import { surveyParticipationId } from './fixtures/survey-participation';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test.describe('Survey participation visual harness', () => {
  for (const scenario of ['populated', 'empty'] as const) {
    test(`renders the ${scenario} participation page`, async ({ page }) => {
      await installMockApi(page, { surveyParticipationScenario: scenario, role: 'user' });
      await page.goto('/surveys/participate');

      const target = page.getByTestId('survey-participation-page');
      await expect(target).toBeVisible();
      await expectVisual(page, target, `survey-participation-${scenario}.png`);
    });
  }

  test('renders the respondent form and its success state', async ({ page }) => {
    await installMockApi(page, { surveyParticipationScenario: 'populated', role: 'user' });
    await page.goto(`/surveys/${surveyParticipationId}/respond`);

    const form = page.getByTestId('survey-respondent-form');
    await expect(form).toBeVisible();
    await expectVisual(page, form, 'survey-respondent-form.png');

    await page.getByRole('radio', { name: '자주 사용' }).check();
    await page.getByRole('button', { name: '제출' }).click();
    const success = page.getByTestId('survey-response-success');
    await expect(success).toBeVisible();
    await expectVisual(page, success, 'survey-respondent-success.png');
  });
});
