import type { Page } from '@playwright/test';
import { SURVEY_EVIDENCE_PICKER_COPY as SURVEY_COPY } from '../../src/lib/copy/survey-evidence-picker';

import { expect, test } from './support/visual-test';

import {
  EVIDENCE_QUOTES,
  FINDING_DETAIL_IDS,
  SURVEY_EVIDENCE_IDS,
  SURVEY_EVIDENCE_QUOTE,
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
    // #675: the title lives in the shared PanelTitleBlock (h2) under the shared header.
    await expect(panel.getByRole('heading', { name: populatedFinding.title })).toBeVisible();
    // #675: the display id moved into the shared DetailPanelHeader (outside the body testid).
    await expect(
      page.locator('[data-kind="finding"]').getByText(populatedFinding.display_id),
    ).toBeVisible();

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
      panel.getByText(`Evidence 하이라이트 (${populatedFinding.evidence_count})`),
    ).toBeVisible();
    await expect(panel.getByTestId('evidence-highlight-row')).toHaveCount(2);
    await expect(panel.getByText(EVIDENCE_QUOTES.voc)).toBeVisible();
    await expect(panel.getByText(EVIDENCE_QUOTES.note)).toBeVisible();

    // Managed System and Analytics Area resolve through their registry fixtures.
    await expect(panel.getByText('Identity Core')).toBeVisible();
    await expect(panel.getByText('인증 세션')).toBeVisible();

    // Linked VOC and linked Task cards resolve their display data. #1174b: the
    // Evidence highlight row now also links the same display id, so the bare
    // display-id name is ambiguous — pin the source-VOC link by its full
    // accessible name (title + display id; \\s* because the accname may join
    // the two spans without whitespace).
    await expect(
      panel.getByRole('link', {
        name: new RegExp(`${findingSourceVoc.title}\\s*${findingSourceVoc.display_id}`),
      }),
    ).toContainText(findingSourceVoc.title);
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
    // #675: the title lives in the shared PanelTitleBlock (h2) under the shared header.
    await expect(panel.getByRole('heading', { name: populatedFinding.title })).toBeVisible();

    for (const testId of MANAGE_CTAS) {
      await expect(panel.getByTestId(testId)).toBeDisabled();
    }
    await expect(page.getByTestId('request-task-draft')).toHaveCount(0);

    await expectBackgroundSettled(page);

    await expectVisual(page, panel, 'finding-detail-permission-limited.png');
  });

  test('requests a Task with the inline draft card and validates the submit body', async ({
    page,
  }) => {
    const mock = await installMockApi(page, { findingDetail: true });

    await page.goto(`/findings/${FINDING_DETAIL_IDS.finding}`);
    await page.getByTestId('request-task-btn').click();

    const draft = page.getByTestId('request-task-draft');
    await expect(draft).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Evidence summary is prefilled from the Finding.
    await expect(draft.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      populatedFinding.summary,
    );
    await draft
      .getByTestId('request-task-requested-outcome-input')
      .fill(requestTaskBody.requested_outcome);
    await expectBackgroundSettled(page);
    await expectVisual(
      page,
      page.getByTestId('finding-detail-panel'),
      'finding-detail-request-task-draft.png',
    );

    const post = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/findings/${FINDING_DETAIL_IDS.finding}/request-task`),
    );
    await draft.getByTestId('request-task-submit').click();
    expect(JSON.parse((await post).postData() ?? '{}')).toEqual(requestTaskBody);
    await expect.poll(() => mock.postedBodies).toEqual([requestTaskBody]);
    await expect(page.getByText('Task Request가 생성되었습니다.')).toBeVisible();
    await expect(draft).toHaveCount(0);
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
    // #675: the title lives in the shared PanelTitleBlock (h2) under the shared header.
    await expect(panel.getByRole('heading', { name: populatedFinding.title })).toBeVisible();
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);

    await expectBackgroundSettled(page);

    await expectVisual(page, page.locator('[data-shell="list"]'), 'findings-list-selected.png');
  });
});

// Desktop 1440×960 is set by playwright.config.ts; preserve the four captures above.
test.describe('Finding Add Evidence approved Survey picker', () => {
  for (const state of ['visible', 'suppressed', 'retry'] as const) {
    test(`renders ${state} Survey attachment state`, async ({ page }) => {
      const mock = await installMockApi(page, {
        findingDetail: true,
        findingSurveyEvidence: state,
      });
      await page.goto(`/findings/${FINDING_DETAIL_IDS.finding}`);
      await expectBackgroundSettled(page);
      await page.getByTestId('add-evidence-btn').click();
      const modal = page.getByTestId('add-evidence-modal');
      await modal.getByTestId('evidence-source-type-select').click();
      await page.getByRole('option', { name: 'Survey', exact: true }).click();
      await modal.getByRole('combobox', { name: SURVEY_COPY.survey }).click();
      await page.getByRole('option', { name: /SRV-42/ }).click();
      await expect(modal.getByTestId('evidence-source-id-input')).toHaveCount(0);
      await expect(modal.getByTestId('evidence-quote-input')).toHaveCount(0);
      if (state === 'suppressed') {
        await expect(modal.getByText(SURVEY_COPY.below_threshold)).toBeVisible();
        await expect(modal.getByTestId('add-evidence-submit')).toBeDisabled();
      } else {
        await modal.getByRole('radio', { name: /로그인 과정/ }).click();
        await expect(modal.getByTestId('add-evidence-submit')).toBeEnabled();
        if (state === 'retry') {
          await modal.getByTestId('add-evidence-submit').click();
          await expect(modal.getByText(SURVEY_COPY.attachError)).toBeVisible();
          await expect(modal.getByRole('radio', { name: /로그인 과정/ })).toBeChecked();
        }
      }
      await expectVisual(page, modal, `finding-add-evidence-survey-${state}.png`);
      if (state !== 'suppressed') {
        await modal.getByTestId('add-evidence-submit').click();
        await expect(modal).toHaveCount(0);
        await expect(page.getByText(SURVEY_EVIDENCE_QUOTE)).toBeVisible();
        expect(mock.postedBodies.at(-1)).toEqual({
          approved_excerpt_id: SURVEY_EVIDENCE_IDS.excerpt,
          sentiment: null,
          importance: null,
        });
        if (state === 'retry')
          expect(mock.postedRequests[1]?.idempotencyKey).toBe(
            mock.postedRequests[0]?.idempotencyKey,
          );
      }
    });
  }
});
