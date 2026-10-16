import { expect, test } from './support/visual-test';

import { IDS } from './fixtures/voc-clusters';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/voc-clusters visual harness', () => {
  test('defaults to the first cluster inside one ListShell', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/voc-clusters');

    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
    await expect(page.locator('[data-shell="page"]')).toHaveCount(0);
    // The canonical created_at DESC, id DESC fixture order selects the invite-delay cluster first.
    await expect(page.getByTestId('cluster-detail-title')).toHaveText('초대 메일 지연');
  });

  test('renders the designed empty state', async ({ page }) => {
    await installMockApi(page, { scenario: 'empty-list' });

    await page.goto('/voc-clusters');

    const emptyState = page.getByTestId('cluster-empty-state');
    await expect(emptyState).toContainText('생성된 VOC Cluster가 없습니다.');
    await expect(emptyState).toContainText('VOC를 묶어 만든 Cluster가 여기에 표시됩니다.');
    await expectVisual(page, emptyState, 'voc-clusters-empty.png');
  });

  test('renders a visible list error instead of a blank list', async ({ page }) => {
    await installMockApi(page, { scenario: 'list-error' });

    await page.goto('/voc-clusters');

    await expect(page.getByTestId('cluster-list-error')).toContainText(
      'VOC Cluster 목록을 불러오지 못했습니다',
    );
    const errorState = page.getByTestId('cluster-list-error');
    await expect(errorState).toContainText('잠시 후 다시 시도하세요.');
  });

  test('filters the list through one real Confirmed tab click', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/voc-clusters');
    await expect(page.getByTestId('cluster-list')).toBeVisible();
    await page.getByTestId('cluster-tab-confirmed').click();

    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('인증 오류 패턴', { exact: true })).toBeVisible();
    await expect(panel.getByText('초대 메일 지연', { exact: true })).toBeVisible();
    await expect(panel.getByText('인증 흐름 불안정', { exact: true })).toHaveCount(0);
  });

  test('shows the permission hint for a User instead of mutation controls', async ({ page }) => {
    await installMockApi(page, { role: 'user' });

    await page.goto(`/voc-clusters/${IDS.draft}`);

    await expect(page.getByTestId('cluster-cta-hint')).toHaveText(
      '관리자 또는 개발자 권한이 있어야 Cluster를 관리할 수 있습니다.',
    );
    await expect(page.getByTestId('cluster-add-voc-button')).toHaveCount(0);
    await expect(page.getByTestId('cluster-confirm-button')).toHaveCount(0);
  });

  test('renders the cluster-add-member-already-included dialog', async ({ page }) => {
    await installMockApi(page);

    await page.goto(`/voc-clusters/${IDS.draft}`);
    await page.getByTestId('cluster-add-voc-button').click();

    const dialog = page.getByTestId('add-voc-modal');
    // Current members are listed in the Cluster detail, not in the picker.
    await expect(dialog.getByTestId(`add-voc-candidate-${IDS.existingVoc}`)).toHaveCount(0);
    await expect(page.getByTestId(`cluster-member-row-${IDS.existingVoc}`)).toBeVisible();
    await expect(dialog.getByTestId(`add-voc-add-${IDS.candidateVoc}`)).toBeEnabled();
    await expectVisual(page, dialog, 'cluster-add-member-already-included.png');
  });
});

test('renders the available Cluster suggestion pair', async ({ page }) => {
  await installMockApi(page, { clusterSuggestions: 'populated' });
  await page.goto('/voc-clusters');
  await page.getByRole('tab', { name: /^Cluster 제안/ }).click();
  await page.getByRole('button', { name: /VOC-12/ }).click();
  const panel = page.getByTestId('cluster-suggestion-panel');
  await expect(panel.getByRole('button', { name: '확인 후 Cluster 생성' })).toBeVisible();
  await expectVisual(page, panel, 'voc-cluster-suggestions-populated.png');
});
