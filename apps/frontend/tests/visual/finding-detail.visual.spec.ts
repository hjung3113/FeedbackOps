import type { Page } from '@playwright/test';

import { expect, test } from './support/visual-test';

import {
  EVIDENCE_QUOTES,
  FINDING_DETAIL_IDS,
  findingSourceVoc,
  linkedTask,
  populatedFinding,
  requestTaskBody,
} from './fixtures/finding-detail';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

// FindingDetailPanel is the #399 refactor subject. These tests pin the CURRENT
// rendering before the 1,205-line panel is split: the populated detail on the
// standalone `/findings/$findingId` surface, the finding.manage-denied CTA
// state, the request-task modal submit contract, and the `/findings` list URL
// selection. Baselines are host-generated (the authoring environment has no
// browser) and must pass 3 consecutive runs without --update.

const MANAGE_CTAS = [
  'add-evidence-btn',
  'link-evidence-btn',
  'request-task-btn',
  'mark-not-actionable-btn',
] as const;

// expectVisual screenshots the WHOLE page, so background queries behind a
// dialog or a list must have settled before capture. The creator chip renders
// the 'Finding creator' fallback until /actors resolves; waiting for the
// RESOLVED name is a positive condition (a `count 0` wait passes trivially
// before the chip has even rendered and captured the fallback).
async function expectBackgroundSettled(page: Page): Promise<void> {
  await expect(page.getByText('정민수')).toHaveCount(1);
  await expect(page.getByText('Finding creator')).toHaveCount(0);
}

test.describe('/findings/$findingId visual harness', () => {
  test('deeplinks through auth to the populated Finding detail panel', async ({ page }) => {
    await installMockApi(page, { findingDetail: true });

    await page.goto(`/findings/${FINDING_DETAIL_IDS.finding}`);

    const panel = page.getByTestId('finding-detail-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 1 })).toHaveText(populatedFinding.title);
    await expect(panel.getByText(populatedFinding.display_id)).toBeVisible();

    // Metadata section: source badge, status, severity + confidence, creator chip.
    const metadata = panel.locator('[data-anchor="metadata"]');
    await expect(metadata.getByText('VOC', { exact: true })).toBeVisible();
    await expect(metadata.getByText('진행 중')).toBeVisible();
    // Severity high and confidence high both render the label 높음 here.
    await expect(metadata.getByText('높음')).toHaveCount(2);
    // The creator chip resolves the fixture actor (display_name '정민수') → initial '정'.
    await expect(metadata.getByText('정', { exact: true })).toBeVisible();
    await expect(metadata.getByText('Finding creator')).toHaveCount(0);

    // Evidence Highlights: DTO count in the section title, one row per fixture item.
    await expect(
      panel.getByText(`Evidence Highlights (${populatedFinding.evidence_count})`),
    ).toBeVisible();
    await expect(panel.getByTestId('evidence-highlight-row')).toHaveCount(2);
    await expect(panel.getByText(EVIDENCE_QUOTES.voc)).toBeVisible();
    await expect(panel.getByText(EVIDENCE_QUOTES.note)).toBeVisible();

    // Managed System and Analytics Area resolve through their registry fixtures.
    await expect(panel.getByText('Identity Core')).toBeVisible();
    await expect(panel.getByText('인증 세션')).toBeVisible();

    // Linked VOC and linked Task cards resolve their display data.
    await expect(panel.getByRole('link', { name: findingSourceVoc.display_id })).toContainText(
      findingSourceVoc.title,
    );
    await expect(panel.getByRole('link', { name: linkedTask.display_id })).toContainText(
      linkedTask.title,
    );

    // finding.manage is approved: every CTA renders enabled; the Task 연결 CTA is
    // absent because linked_task_id is already set.
    for (const testId of MANAGE_CTAS) {
      await expect(panel.getByTestId(testId)).toBeEnabled();
    }
    await expect(panel.getByTestId('link-task-btn')).toHaveCount(0);

    await expectBackgroundSettled(page);

    await expectVisual(page, panel, 'finding-detail-populated.png');
  });

  test('keeps the finding.manage actions disabled when the permission check denies', async ({
    page,
  }) => {
    // role 'user' → /me reports a non-admin role and /me/permissions/check
    // answers blocked, so canManage is false on the client.
    await installMockApi(page, { findingDetail: true, role: 'user' });

    await page.goto(`/findings/${FINDING_DETAIL_IDS.finding}`);

    // Precondition: the populated panel itself renders, so the negative CTA
    // assertions below are not vacuous.
    const panel = page.getByTestId('finding-detail-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 1 })).toHaveText(populatedFinding.title);

    for (const testId of MANAGE_CTAS) {
      await expect(panel.getByTestId(testId)).toBeDisabled();
    }
    await expect(page.getByTestId('request-task-modal')).toHaveCount(0);

    await expectBackgroundSettled(page);

    await expectVisual(page, panel, 'finding-detail-permission-limited.png');
  });

  test('requests a Task through the Radix portal and validates the submit body', async ({
    page,
  }) => {
    const mock = await installMockApi(page, { findingDetail: true });

    await page.goto(`/findings/${FINDING_DETAIL_IDS.finding}`);
    await page.getByTestId('request-task-btn').click();

    const dialog = page.getByTestId('request-task-modal');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // Evidence summary is prefilled from the Finding.
    await expect(dialog.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      populatedFinding.summary,
    );
    await dialog
      .getByTestId('request-task-requested-outcome-input')
      .fill(requestTaskBody.requested_outcome);
    await expectBackgroundSettled(page);
    await expectVisual(page, dialog, 'finding-detail-request-task-modal.png');

    const post = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/findings/${FINDING_DETAIL_IDS.finding}/request-task`),
    );
    await dialog.getByTestId('request-task-submit').click();
    expect(JSON.parse((await post).postData() ?? '{}')).toEqual(requestTaskBody);
    await expect.poll(() => mock.postedBodies).toEqual([requestTaskBody]);
    await expect(page.getByText('Task Request가 생성되었습니다.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('deep-selects the Finding through the list URL state', async ({ page }) => {
    await installMockApi(page, { findingDetail: true });

    await page.goto(`/findings?selected=${FINDING_DETAIL_IDS.finding}`);

    const list = page.getByTestId('finding-list');
    await expect(list).toBeVisible();
    // The deep link survives selection reconciliation because the list contains it.
    await expect(list.getByTestId('object-row-selected-bar')).toHaveCount(1);
    await expect(list.getByText(populatedFinding.display_id)).toBeVisible();
    await expect(list.getByTestId('finding-status-badge-active')).toBeVisible();

    const panel = page.getByTestId('finding-detail-panel');
    await expect(panel.getByRole('heading', { level: 1 })).toHaveText(populatedFinding.title);
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);

    await expectBackgroundSettled(page);

    await expectVisual(page, page.locator('[data-shell="list"]'), 'findings-list-selected.png');
  });
});
