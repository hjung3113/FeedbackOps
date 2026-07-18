import { expect, test } from "./support/visual-test";

import { VOC_REPORTER_TASK_SUMMARY_IDS } from "./fixtures/voc-reporter-task-summary";
import { installMockApi } from "./support/mock-api";
import { expectVisual } from "./support/screenshot";

test.describe("VOC reporter Task summary visual harness (#179)", () => {
  test("shows only the linked Task reporter summary", async ({ page }) => {
    await installMockApi(page, { vocReporterTaskSummary: true, role: "user" });
    await page.goto(
      `/vocs?view=inbox&selected=${VOC_REPORTER_TASK_SUMMARY_IDS.voc}`,
    );

    const summary = page.getByTestId("linked-task-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("데이터 새로고침 오류 개선");
    await expect(summary).toContainText("진행 중");
    await expectVisual(
      page,
      page.getByTestId("voc-detail-panel"),
      "voc-reporter-task-summary.png",
    );
  });
});
