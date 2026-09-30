import {
  surveyResultVisualFixture,
  surveyResultsFixtureFor,
  surveyResultsFixtureSchema,
  surveyResultsSurveyFixture,
  surveyResultsVisualScenarios,
} from './fixtures/survey-results';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

test('survey results fixtures reject an unsupported create_voc action', () => {
  const result = surveyResultsFixtureSchema.safeParse({
    ...surveyResultsFixtureFor('populated'),
    next_actions: [{ id: 'create_voc', availability: 'allowed', intent: 'open_finding_draft' }],
  });
  expect(result.success).toBe(false);
});

test('survey result questions resolve to survey prompts', () => {
  const prompts = new Map(
    surveyResultsSurveyFixture.questions.map((question) => [question.id, question.prompt]),
  );
  const resultQuestions = surveyResultsFixtureFor('populated').questions;

  expect(resultQuestions.every((question) => Boolean(prompts.get(question.question_id)))).toBe(
    true,
  );
});

test.describe('/surveys/:surveyId/results visual harness', () => {
  for (const scenario of surveyResultsVisualScenarios) {
    test(`renders ${scenario}`, async ({ page }) => {
      await installMockApi(page, {
        surveyResultsScenario: scenario,
        role: scenario === 'no-permission' ? 'user' : 'admin',
      });
      await page.goto(`/surveys/${surveyResultVisualFixture.id}/results`);
      if (scenario === 'finding-draft') {
        await page.getByRole('button', { name: 'Finding 생성' }).click();
      }
      const target =
        scenario === 'no-permission'
          ? page.getByText('Survey Result')
          : page.getByTestId('survey-results-summary');
      await expect(target).toBeVisible();
      if (scenario === 'non-outcome') {
        await expect(page.getByTestId('survey-result-header')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Survey result views' })).toHaveCount(0);
      }
      await expectVisual(page, target, `survey-results-${scenario}.png`);
    });
  }
});
