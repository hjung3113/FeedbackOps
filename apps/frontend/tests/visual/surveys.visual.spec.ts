import { expect, test } from "./support/visual-test";
import { surveyVisualFixture, surveyVisualScenarios } from "./fixtures/surveys";
import { installMockApi } from "./support/mock-api";
import { expectVisual } from "./support/screenshot";

test.describe("/surveys visual harness", () => {
  for (const scenario of surveyVisualScenarios) {
    test(`renders ${scenario}`, async ({ page }) => {
      await installMockApi(page, {
        surveyScenario: scenario,
        role: scenario === "no-permission" ? "user" : "admin",
      });
      const url =
        scenario === "detail"
          ? `/surveys/${surveyVisualFixture.id}`
          : scenario === "builder"
            ? `/surveys/${surveyVisualFixture.id}?builder=true`
            : "/surveys";
      await page.goto(url);
      const target =
        scenario === "builder"
          ? page.getByTestId("survey-builder")
          : scenario === "detail"
            ? page.getByTestId("survey-detail")
            : scenario === "error"
              ? page.getByTestId("survey-list-error")
              : page.getByTestId("survey-list");
      await expect(target).toBeVisible();
      await expectVisual(page, target, `surveys-${scenario}.png`);
    });
  }
});
