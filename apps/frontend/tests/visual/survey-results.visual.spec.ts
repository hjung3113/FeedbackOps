import {
  surveyResultVisualFixture,
  surveyResultsFixtureFor,
  surveyResultsFixtureSchema,
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

test.describe('/surveys/:surveyId/results visual harness', () => {
  for (const scenario of surveyResultsVisualScenarios) {
    test(`renders ${scenario}`, async ({ page }) => {
      await installMockApi(page, {
        surveyResultsScenario: scenario,
        role: scenario === 'no-permission' ? 'user' : 'admin',
      });
      await page.goto(`/surveys/${surveyResultVisualFixture.id}/results`);
      const target =
        scenario === 'no-permission'
          ? page.getByText('Survey Result')
          : page.getByTestId('survey-results-summary');
      await expect(target).toBeVisible();
      await expectVisual(page, target, `survey-results-${scenario}.png`);
    });
  }
});
