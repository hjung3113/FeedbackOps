import { expect, test } from './support/visual-test';

import {
  PERMISSION_EXPIRATION_VISUAL_DATE,
  PERMISSION_IDS,
  permissionVisualScenarios,
} from './fixtures/permissions';
import { installMockApi, parsePermissionDecisionBody } from './support/mock-api';
import { expectVisual } from './support/screenshot';

test.describe('/admin/permissions/requests visual harness', () => {
  for (const scenario of permissionVisualScenarios) {
    test(scenario, async ({ page }) => {
      await installMockApi(page, {
        permissionScenario: scenario,
        role: scenario === 'blocked-contact-admin' ? 'user' : 'admin',
      });
      await page.goto('/admin/permissions/requests');
      if (scenario === 'blocked-contact-admin') {
        const target = page.locator('[data-permission-state="blocked_non_requestable"]');
        await expect(target).toBeVisible();
        await expect(target).toContainText('담당 관리자에게 문의하세요.');
        await expect(target).toContainText('Admin One');
        await expect(target.getByRole('button', { name: 'Request access' })).toHaveCount(0);
        await expectVisual(page, target, 'blocked-contact-admin.png');
        return;
      }
      const detail = page.getByTestId('permission-request-detail-panel');
      await expect(detail.getByText('Permission Request', { exact: true })).toBeVisible();
      await expect(detail.getByText('Named Requester', { exact: true })).toBeVisible();
      await expect(detail.getByText('named.requester@example.test', { exact: true })).toHaveCount(
        0,
      );
      await expectVisual(page, detail, 'permission-request-detail-named.png');
    });
  }

  test('renders the populated permission review console with its first pending request selected', async ({
    page,
  }) => {
    await installMockApi(page);

    await page.goto('/admin/permissions/requests');

    const list = page.getByTestId('permission-requests-list');
    const detail = page.getByTestId('permission-request-detail-panel');
    await expect(page.getByRole('tab', { name: /대기 중 \(3\)/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(list.getByText('workspace.admin', { exact: true })).toBeVisible();
    await expect(list.getByText('workspace.read', { exact: true })).toBeVisible();
    await expect(detail).toContainText('workspace.admin');
    await expect(detail.getByTestId('permission-decision-section')).toBeVisible();
    await expectVisual(page, detail, 'permission-requests-console-populated.png');
  });

  test('shows a requested expiration in the list and detail and captures all approval choices', async ({
    page,
  }) => {
    await installMockApi(page, { permissionScenario: 'requested-expiration' });

    await page.goto('/admin/permissions/requests');

    const list = page.getByTestId('permission-requests-list');
    const detail = page.getByTestId('permission-request-detail-panel');
    const requestedDate = PERMISSION_EXPIRATION_VISUAL_DATE.slice(0, 10);
    await list.getByText('workspace.read', { exact: true }).click();
    await expect(list.getByText(`만료 ${requestedDate}`, { exact: true })).toBeVisible();
    await expect(detail.getByText(requestedDate, { exact: true })).toBeVisible();
    await expect(detail).toContainText('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    await detail.getByRole('button', { name: '승인', exact: true }).click();

    const keepOption = detail.getByRole('radio', {
      name: `요청 만료일 유지 · ${requestedDate}`,
    });
    await expect(keepOption).toHaveAttribute('aria-checked', 'true');
    await expect(detail.getByLabel('새 만료일')).toHaveValue(requestedDate);
    await expectVisual(page, list, 'permission-request-expiration-keep.png');

    await detail.getByText('만료일 변경', { exact: true }).click();
    await detail.getByLabel('새 만료일').fill('2027-01-31');
    await expect(detail.getByRole('radio', { name: '만료일 변경' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectVisual(page, detail, 'permission-request-expiration-change.png');

    await detail.getByText('만료 없음', { exact: true }).click();
    await expect(detail.getByRole('radio', { name: '만료 없음' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expectVisual(page, detail, 'permission-request-expiration-clear.png');
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
    await page
      .getByTestId('permission-requests-list')
      .getByText('workspace.read', { exact: true })
      .click();
    await expect(detail).toContainText('workspace.read');
    await expect(detail.getByLabel('사유 · 선택')).toBeVisible();
    await detail.getByRole('button', { name: '승인', exact: true }).click();
    await detail.getByTestId('permission-decision-submit').click();
    await expect
      .poll(() => mock.postedRequests)
      .toEqual([
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

  test('AC-8 opens a self-approval request with no decision preselected, then approves', async ({
    page,
  }) => {
    const mock = await installMockApi(page);

    await page.goto('/admin/permissions/requests');
    await page
      .getByTestId('permission-requests-list')
      .getByText('task.self_approve_request', { exact: true })
      .click();

    const detail = page.getByTestId('permission-request-detail-panel');
    const approve = detail.getByRole('button', { name: '승인', exact: true });
    // #524: the form starts with no decision and submit disabled until an explicit choice.
    await expect(approve).toHaveAttribute('aria-pressed', 'false');
    await expect(detail.getByTestId('permission-decision-submit')).toBeDisabled();
    await approve.click();
    await expect(approve).toHaveAttribute('aria-pressed', 'true');
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
    await expect
      .poll(() => mock.postedRequests)
      .toEqual([
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

  test('posts a non-sensitive approval with its idempotency key and refetches the list', async ({
    page,
  }) => {
    const mock = await installMockApi(page);

    await page.goto('/admin/permissions/requests');
    await page
      .getByTestId('permission-requests-list')
      .getByText('workspace.read', { exact: true })
      .click();

    const detail = page.getByTestId('permission-request-detail-panel');
    // #524: no decision is preselected; approve must be chosen explicitly.
    await detail.getByRole('button', { name: '승인', exact: true }).click();
    await detail.getByLabel('사유 · 선택').fill('읽기 권한을 승인합니다.');
    await detail.getByTestId('permission-decision-submit').click();

    await expect
      .poll(() => mock.postedRequests)
      .toEqual([
        {
          pathname: `/permissions/requests/${PERMISSION_IDS.pendingRead}/approve`,
          body: { reason: '읽기 권한을 승인합니다.' },
          idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        },
      ]);
    await expect(
      page.getByTestId('permission-requests-list').getByText('workspace.read', { exact: true }),
    ).toHaveCount(0);
  });

  test('filters to approved requests and hides decisions for decided requests', async ({
    page,
  }) => {
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
