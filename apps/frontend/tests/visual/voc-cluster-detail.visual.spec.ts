import { expect, test } from "./support/visual-test";

import {
  IDS,
  addCandidateRequest,
  confirmedLinkedFinding,
  linkExistingFindingRequest,
} from "./fixtures/voc-clusters";
import { installMockApi } from "./support/mock-api";
import { expectVisual } from "./support/screenshot";

test.describe("/voc-clusters/$clusterId visual harness", () => {
  test("deeplinks through auth to the populated detail panel", async ({
    page,
  }) => {
    await installMockApi(page);

    await page.goto(`/voc-clusters/${IDS.linked}`);

    const detail = page.getByTestId("cluster-detail-panel");
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
    await expect(detail.getByTestId("cluster-detail-title")).toHaveText(
      confirmedLinkedFinding.title,
    );
    for (const anchor of [
      "overview",
      "why",
      "execution",
      "members",
      "properties",
    ]) {
      await expect(detail.locator(`[data-anchor="${anchor}"]`)).toHaveCount(1);
    }
    // Severity is intentionally rendered in both Overview and Properties; assert the Overview badge.
    await expect(
      detail
        .locator('[data-anchor="overview"] [data-token="--severity-high"]')
        .filter({ hasText: "높음" }),
    ).toBeVisible();
    await expect(detail.getByTestId("cluster-detail-confidence-badge")).toContainText(
      "Confidence · high",
    );
    await expect(
      detail.locator('[data-token="--status-reporter-reviewing"]'),
    ).toBeVisible();
    await expect(detail.getByTestId("cluster-members-list")).toBeVisible();
    // D10: title is intentionally absent from the schema-valid linked Finding fixture.
    await expect(
      detail.getByTestId(`cluster-linked-finding-${IDS.finding}`),
    ).toContainText("FND-201");
    await expect(detail.locator('a[href="/voc-clusters"]')).toHaveCount(0);
    await expectVisual(page, detail, "voc-cluster-detail-populated.png");
  });

  test("adds a candidate through the Radix portal and refetches stateful detail data", async ({
    page,
  }) => {
    const mock = await installMockApi(page);

    await page.goto(`/voc-clusters/${IDS.draft}`);
    await page.getByTestId("cluster-add-voc-button").click();

    const dialog = page.getByTestId("add-voc-modal");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("add-voc-candidate-picker")).toBeVisible();
    await expectVisual(page, dialog, "voc-cluster-add-voc-dialog.png");

    await dialog
      .getByTestId("add-voc-candidate-picker")
      .selectOption(IDS.candidateVoc);
    const post = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith(`/voc-clusters/${IDS.draft}/vocs`),
    );
    await dialog.getByTestId("add-voc-submit").click();
    expect(JSON.parse((await post).postData() ?? "{}")).toEqual(
      addCandidateRequest,
    );
    await expect.poll(() => mock.postedBodies).toEqual([addCandidateRequest]);
    await expect(
      page.getByTestId(`cluster-member-row-${IDS.candidateVoc}`),
    ).toContainText("VOC-102");
  });

  test("links an existing Finding through the picker and refetches the execution section", async ({
    page,
  }) => {
    const mock = await installMockApi(page);
    await page.goto(`/voc-clusters/${IDS.draft}`);
    await page.getByTestId("cluster-link-existing-finding-button").click();
    const dialog = page.getByTestId("link-existing-finding-modal");
    await expect(
      dialog.getByTestId("link-existing-finding-picker"),
    ).toBeVisible();
    await dialog
      .getByTestId("link-existing-finding-picker")
      .selectOption(IDS.finding);
    const post = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith(`/voc-clusters/${IDS.draft}/link-finding`),
    );
    await dialog.getByTestId("link-existing-finding-submit").click();
    expect(JSON.parse((await post).postData() ?? "{}")).toEqual(
      linkExistingFindingRequest,
    );
    await expect
      .poll(() => mock.postedBodies)
      .toEqual([linkExistingFindingRequest]);
    await expect(
      page.getByTestId(`cluster-linked-finding-${IDS.finding}`),
    ).toContainText("FND-201");
  });

  test("renders the explicit not-found detail state", async ({ page }) => {
    await installMockApi(page, { scenario: "detail-404" });

    await page.goto(`/voc-clusters/${IDS.draft}`);

    await expect(page.getByTestId("cluster-detail-error")).toContainText(
      "클러스터를 찾을 수 없습니다.",
    );
  });

  test("renders the explicit generic detail error state", async ({ page }) => {
    await installMockApi(page, { scenario: "detail-error" });

    await page.goto(`/voc-clusters/${IDS.draft}`);

    await expect(page.getByTestId("cluster-detail-error")).toContainText(
      "데이터를 불러오지 못했습니다.",
    );
  });
});
