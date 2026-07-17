import { expect, test } from './support/visual-test';

import { IDS, addCandidateRequest } from './fixtures/voc-clusters';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/voc-clusters/$clusterId visual harness', () => {
  test('deeplinks through auth to the populated detail panel', async ({ page }) => {
    await installMockApi(page);

    await page.goto(`/voc-clusters/${IDS.linked}`);

    const detail = page.getByTestId('cluster-detail-panel');
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
    await expect(detail.getByTestId('cluster-detail-title')).toHaveText('인증 오류 패턴');
    await expect(detail.getByTestId('cluster-members-list')).toBeVisible();
    // D10: title is intentionally absent from the schema-valid linked Finding fixture.
    await expect(detail.getByTestId(`cluster-linked-finding-${IDS.finding}`)).toContainText('FND-201');
    await expect(detail.locator('a[href="/voc-clusters"]')).toHaveCount(0);
    await expectVisual(page, detail, 'voc-cluster-detail-populated.png');
  });

  test('adds a candidate through the Radix portal and refetches stateful detail data', async ({ page }) => {
    const mock = await installMockApi(page);

    await page.goto(`/voc-clusters/${IDS.draft}`);
    await page.getByTestId('cluster-add-voc-button').click();

    const dialog = page.getByTestId('add-voc-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('add-voc-candidate-picker')).toBeVisible();
    await expectVisual(page, dialog, 'voc-cluster-add-voc-dialog.png');

    await dialog.getByTestId('add-voc-candidate-picker').selectOption(IDS.candidateVoc);
    const post = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().endsWith(`/voc-clusters/${IDS.draft}/vocs`),
    );
    await dialog.getByTestId('add-voc-submit').click();
    expect(JSON.parse((await post).postData() ?? '{}')).toEqual(addCandidateRequest);
    await expect.poll(() => mock.postedBodies).toEqual([addCandidateRequest]);
    await expect(page.getByTestId(`cluster-member-row-${IDS.candidateVoc}`)).toContainText('VOC-102');
  });

  test('renders the explicit not-found detail state', async ({ page }) => {
    await installMockApi(page, { scenario: 'detail-404' });

    await page.goto(`/voc-clusters/${IDS.draft}`);

    await expect(page.getByTestId('cluster-detail-error')).toContainText('클러스터를 찾을 수 없습니다.');
  });

  test('renders the explicit generic detail error state', async ({ page }) => {
    await installMockApi(page, { scenario: 'detail-error' });

    await page.goto(`/voc-clusters/${IDS.draft}`);

    await expect(page.getByTestId('cluster-detail-error')).toContainText('데이터를 불러오지 못했습니다.');
  });
});
