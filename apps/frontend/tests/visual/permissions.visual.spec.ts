import { expect, test } from './support/visual-test';

import { PERMISSION_IDS } from './fixtures/permissions';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/admin/permissions/requests visual harness', () => {
  test('renders the populated permission review console with its first pending request selected', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/admin/permissions/requests');

    const list = page.getByTestId('permission-requests-list');
    const detail = page.getByTestId('permission-request-detail-panel');
    await expect(page.getByRole('tab', { name: /대기 중 \(2\)/ })).toHaveAttribute('aria-selected', 'true');
    await expect(list.getByText('workspace.admin', { exact: true })).toBeVisible();
    await expect(list.getByText('workspace.read', { exact: true })).toBeVisible();
    await expect(detail).toContainText('workspace.admin');
    await expect(detail.getByTestId('permission-decision-section')).toBeVisible();
    await expectVisual(page, detail, 'permission-requests-console-populated.png');
  });

  test('gates required reasons and leaves non-sensitive approval optional', async ({ page }) => {
    const mock = await installMockApi(page);

    await page.goto('/admin/permissions/requests');

    const detail = page.getByTestId('permission-request-detail-panel');
    await detail.getByRole('button', { name: '거절', exact: true }).click();
    await expect(detail.getByLabel('사유 · 필수')).toBeVisible();
    await detail.getByTestId('permission-decision-submit').click();
    await expect.poll(() => mock.postedRequests).toHaveLength(0);

    await detail.getByRole('button', { name: '승인', exact: true }).click();
    await expect(detail.getByLabel('사유 · 필수')).toBeVisible();
    await detail.getByTestId('permission-decision-submit').click();
    await expect.poll(() => mock.postedRequests).toHaveLength(0);
    await page.getByTestId('permission-requests-list').getByText('workspace.read', { exact: true }).click();
    await expect(detail).toContainText('workspace.read');
    await expect(detail.getByLabel('사유 · 선택')).toBeVisible();
    await detail.getByRole('button', { name: '승인', exact: true }).click();
    await detail.getByTestId('permission-decision-submit').click();
    await expect.poll(() => mock.postedRequests).toEqual([
      {
        pathname: `/permissions/requests/${PERMISSION_IDS.pendingRead}/approve`,
        body: {},
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      },
    ]);
  });

  test('posts a non-sensitive approval with its idempotency key and refetches the list', async ({ page }) => {
    const mock = await installMockApi(page);

    await page.goto('/admin/permissions/requests');
    await page.getByTestId('permission-requests-list').getByText('workspace.read', { exact: true }).click();

    const detail = page.getByTestId('permission-request-detail-panel');
    await detail.getByLabel('사유 · 선택').fill('읽기 권한을 승인합니다.');
    await detail.getByTestId('permission-decision-submit').click();

    await expect.poll(() => mock.postedRequests).toEqual([
      {
        pathname: `/permissions/requests/${PERMISSION_IDS.pendingRead}/approve`,
        body: { reason: '읽기 권한을 승인합니다.' },
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      },
    ]);
    await expect(page.getByTestId('permission-requests-list').getByText('workspace.read', { exact: true })).toHaveCount(0);
  });

  test('filters to approved requests and hides decisions for decided requests', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/admin/permissions/requests');
    await page.getByRole('tab', { name: /승인됨 \(1\)/ }).click();

    const list = page.getByTestId('permission-requests-list');
    await expect(list.getByText('workspace.read', { exact: true })).toBeVisible();
    await expect(list.getByText('workspace.admin', { exact: true })).toHaveCount(0);
    await expect(list.getByText('voc.triage', { exact: true })).toHaveCount(0);
    await expect(list.getByText('finding.manage', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('permission-request-detail-panel')).toContainText('승인됨');
    await expect(page.getByTestId('permission-decision-section')).toHaveCount(0);
  });

  test('renders the designed empty state', async ({ page }) => {
    await installMockApi(page, { permissionScenario: 'empty' });

    await page.goto('/admin/permissions/requests');

    const emptyState = page.getByText('표시할 권한 요청이 없습니다.', { exact: true });
    await expect(emptyState).toBeVisible();
    await expectVisual(page, emptyState, 'permission-requests-empty.png');
  });

  test('blocks the console for a non-admin user', async ({ page }) => {
    await installMockApi(page, { role: 'user' });

    await page.goto('/admin/permissions/requests');

    await expect(page.locator('[data-permission-state="blocked_non_requestable"]')).toBeVisible();
    await expect(page.getByTestId('permission-requests-list')).toHaveCount(0);
    await expect(page.getByTestId('permission-decision-section')).toHaveCount(0);
  });
});
