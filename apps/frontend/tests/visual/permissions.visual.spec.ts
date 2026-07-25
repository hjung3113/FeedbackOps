import { expect, test } from './support/visual-test';

import { PERMISSION_IDS } from './fixtures/permissions';
import { installMockApi, parsePermissionDecisionBody } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/admin/permissions/requests visual harness', () => {
  test('renders the populated permission review console with its first pending request selected', async ({ page }) => {
    await installMockApi(page);

    await page.goto('/admin/permissions/requests');

    const list = page.getByTestId('permission-requests-list');
    const detail = page.getByTestId('permission-request-detail-panel');
    await expect(page.getByRole('tab', { name: /대기 중 \(3\)/ })).toHaveAttribute('aria-selected', 'true');
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

  test('AC-3 parses valid self-approval envelopes and rejects unknown approve keys through the mock API parser', () => {
    expect(
      parsePermissionDecisionBody('approve', {
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }),
    ).toEqual({
      self_approval: {
        policy_citation: 'workspace policy §4.3',
        peer_reviewer_absence: 'all peer reviewers are unavailable',
      },
    });
    expect(() =>
      parsePermissionDecisionBody('approve', {
        reason: 'approved',
        unexpected: true,
      }),
    ).toThrow();
  });

  test('AC-8 opens a self-approval request with approve pending', async ({ page }) => {
    const mock = await installMockApi(page);

    await page.goto('/admin/permissions/requests');
    await page.getByTestId('permission-requests-list').getByText('task.self_approve_request', { exact: true }).click();

    const detail = page.getByTestId('permission-request-detail-panel');
    await expect(detail.getByRole('button', { name: '승인', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByTestId('self-approval-audit-capture')).toBeVisible();
    await detail.getByLabel(/Policy citation/).fill('workspace policy §4.3');
    await detail.getByLabel(/Peer reviewer 부재 사유/).fill('다른 reviewer 모두 PTO입니다.');
    // The detail panel is its own scroll container, so expectVisual's window.scrollTo(0, 0)
    // cannot normalise it: filling the textarea scrolls it by a timing-dependent amount.
    // Wait for fonts (they change content height) and then clamp the panel to its scroll
    // end, which is the one offset that cannot drift — this frames the whole capture block.
    // Note: the walk below treats "content taller than the box" as "scrollable", which holds
    // because the panel's only overflowing ancestor is its overflow-y-auto container. If that
    // markup is restructured, the write can become a silent no-op and the flake returns.
    await page.evaluate(() => document.fonts.ready);
    await detail.getByTestId('permission-decision-submit').evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
      if (node) node.scrollTop = node.scrollHeight;
    });
    await expectVisual(page, detail, 'permission-request-self-approval-capture.png');
    await detail.getByTestId('permission-decision-submit').click();
    await expect.poll(() => mock.postedRequests).toEqual([
      {
        pathname: `/permissions/requests/${PERMISSION_IDS.selfApproval}/approve`,
        body: {
          self_approval: {
            policy_citation: 'workspace policy §4.3',
            peer_reviewer_absence: '다른 reviewer 모두 PTO입니다.',
          },
        },
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
