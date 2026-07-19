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
    await expect(emptyState).toHaveText('생성된 클러스터가 없습니다.');
    await expectVisual(page, emptyState, 'voc-clusters-empty.png');
  });

  test('renders a visible list error instead of a blank list', async ({ page }) => {
    await installMockApi(page, { scenario: 'list-error' });

    await page.goto('/voc-clusters');

    await expect(page.getByTestId('cluster-list-error')).toHaveText('데이터를 불러오지 못했습니다.');
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
      'Admin 또는 Developer 권한이 있어야 클러스터를 관리할 수 있습니다.',
    );
    await expect(page.getByTestId('cluster-add-voc-button')).toHaveCount(0);
    await expect(page.getByTestId('cluster-confirm-button')).toHaveCount(0);
  });
});
