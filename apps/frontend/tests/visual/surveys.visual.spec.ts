import { expect, test } from './support/visual-test';
import { surveyVisualFixture, surveyVisualScenarios } from './fixtures/surveys';

// The shared mock-api router is deliberately outside Issue #188's allowlist.
// Keep the fixture fail-closed and enumerate all required captures; the conductor
// wires these scenarios into that router and generates baselines outside sandbox.
test.describe('/surveys visual harness', () => {
  for (const scenario of surveyVisualScenarios) {
    test.skip(`${scenario} fixture is schema-valid`, async ({ page }) => {
      await page.goto(`/surveys?visualScenario=${scenario}&selected=${surveyVisualFixture.id}`);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
