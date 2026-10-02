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

  test('renders the load-more action when answerable Surveys have another page', async ({
    page,
  }) => {
    await installMockApi(page, { surveyParticipationScenario: 'has-more', role: 'user' });
    await page.goto('/surveys/participate');

    const target = page.getByTestId('survey-participation-page');
    await expect(target).toBeVisible();
    await expect(target.getByRole('button', { name: '더 보기' })).toBeVisible();
    await expectVisual(page, target, 'survey-participation-more.png');
  });

  test('renders the respondent form and its success state', async ({ page }) => {
    await installMockApi(page, { surveyParticipationScenario: 'populated', role: 'user' });
    await page.goto(`/surveys/${surveyParticipationId}/respond`);

    const form = page.getByTestId('survey-respondent-form');
    await expect(form).toBeVisible();
    await expect(
      form.getByRole('radiogroup', { name: /리포트 사용 빈도를 평가해 주세요/ }),
    ).toBeVisible();
    await expect(form.getByText('훨씬 자주')).toBeVisible();
    await expect(form.getByText('거의 없음')).toBeVisible();
    await expect(form.getByRole('checkbox', { name: '차트' })).toBeVisible();
    await expect(form.getByRole('textbox', { name: '개선할 점을 적어주세요.' })).toBeVisible();
    await expectVisual(page, form, 'survey-respondent-form.png');

    await form.getByRole('button', { name: '3' }).click();
    await page.getByRole('button', { name: '제출' }).click();
    const success = page.getByTestId('survey-response-success');
    await expect(success).toBeVisible();
    await expectVisual(page, success, 'survey-respondent-success.png');
  });
});
