import type { AdminPermissionRequestRow } from '@/lib/api';
import { adminDetailFixture } from '@/test/permission-details';
import type { PermissionRiskIndicator } from '@fops/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../permission-request-decision-form.js', () => ({
  PermissionRequestDecisionForm: () => null,
}));

import { PermissionRequestDetail } from '../permission-request-detail.js';

const REQUEST: AdminPermissionRequestRow = {
  id: '10000000-0000-0000-0000-000000000001',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  requested_capability: 'workspace.admin',
  requested_managed_system_id: null,
  reason: 'Workspace administration is needed for review.',
  status: 'pending',
  revision: 1,
  requested_expiration: null,
  created_at: '2026-07-10T00:00:00.000Z',
};

const CURRENT_SYSTEM_ID = '30000000-0000-0000-0000-000000000003';
const SECOND_SYSTEM_ID = '40000000-0000-0000-0000-000000000004';
const UNKNOWN_SYSTEM_ID = '50000000-0000-0000-0000-000000000005';

const SENSITIVE_SIGNAL: PermissionRiskIndicator = {
  code: 'sensitive_capability',
  evidence: { capability: 'workspace.admin' },
};

const RISK_INDICATORS: PermissionRiskIndicator[] = [
  SENSITIVE_SIGNAL,
  { code: 'workspace_scope', evidence: { managed_system_id: null } },
  { code: 'no_expiration', evidence: { requested_expiration: null } },
  {
    code: 'active_deny',
    evidence: {
      denies: [
        { id: '60000000-0000-0000-0000-000000000006', managed_system_id: null },
        { id: '70000000-0000-0000-0000-000000000007', managed_system_id: UNKNOWN_SYSTEM_ID },
      ],
    },
  },
];

describe('permission request risk review', () => {
  it.each([{ riskIndicators: [] }, { riskIndicators: RISK_INDICATORS.slice(0, 3) }])(
    'puts signals before compact access facts and omits unrelated self-approval rows (%j)',
    ({ riskIndicators }) => {
      render(
        <PermissionRequestDetail
          request={adminDetailFixture(REQUEST, false, 'allowed', {
            risk_indicators: riskIndicators,
          })}
          onClose={() => undefined}
        />,
      );
      const review = within(screen.getByTestId('permission-request-risk-review'));
      const signals =
        riskIndicators.length === 0
          ? review.getByText('추가 확인 사항 없음')
          : review.getByText('민감한 권한 · 워크스페이스 관리자 권한');
      const access = review.getByText('요청 범위의 현재 권한');
      expect(
        signals.compareDocumentPosition(access) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(access.parentElement).toHaveTextContent('권한 없음');
      expect(review.queryByText('본인 요청')).not.toBeInTheDocument();
      expect(review.queryByText('본인 승인 정책')).not.toBeInTheDocument();
      expect(review.queryByText('본인 승인 사유 필요')).not.toBeInTheDocument();
      expect(review.queryByText('현재 상태 기준')).not.toBeInTheDocument();
    },
  );

  it('explains each supplied signal with requester, effective access, and authority facts', () => {
    const request = adminDetailFixture(REQUEST, false, 'forbidden', {
      requester: {
        id: REQUEST.requester_actor_id,
        display_name: 'Requester',
        role_level: 'developer',
      },
      effective_access: {
        decision: {
          allow: true,
          via: 'direct_grant',
          grant_id: '80000000-0000-0000-0000-000000000008',
        },
        scope: { kind: 'scoped', managed_system_ids: [CURRENT_SYSTEM_ID, SECOND_SYSTEM_ID] },
        expires_at: '2099-12-31T23:59:59.000Z',
        granted_managed_system_id: CURRENT_SYSTEM_ID,
      },
      administrative_authority: {
        capability: 'workspace.admin',
        allowed: true,
        is_requester: false,
        permission_self_approval: 'forbidden',
        self_approval_required: true,
      },
      risk_indicators: RISK_INDICATORS,
    });

    render(
      <PermissionRequestDetail
        request={request}
        managedSystemNames={{
          [CURRENT_SYSTEM_ID]: 'Payments Ops',
          [SECOND_SYSTEM_ID]: 'Analytics Ops',
        }}
        onClose={() => undefined}
      />,
    );

    const review = screen.getByTestId('permission-request-risk-review');
    expect(review).toHaveTextContent('검토 시 확인할 사항');
    expect(review).toHaveTextContent('요청자 역할');
    expect(review).toHaveTextContent('개발자');
    expect(review).toHaveTextContent('요청 범위의 현재 권한');
    expect(review).toHaveTextContent('허용 · 직접 부여');
    expect(review).toHaveTextContent('현재 보유 범위:');
    expect(review).toHaveTextContent('Payments Ops · Analytics Ops');
    expect(review).toHaveTextContent('만료 2099. 12. 31.');
    expect(review).toHaveTextContent('검토 권한');
    expect(review).toHaveTextContent('워크스페이스 관리자 권한');

    const requestInfo = screen.getByText('요청 정보').closest('section');
    expect(requestInfo).toHaveTextContent('요청 만료일');
    expect(requestInfo).toHaveTextContent('만료 없음');
    expect(review).toHaveTextContent('민감한 권한');
    expect(review).toHaveTextContent('민감한 권한 · 워크스페이스 관리자 권한');
    expect(review).toHaveTextContent('워크스페이스 전체 범위');
    expect(review).toHaveTextContent('요청 만료일 없음');
    expect(review).toHaveTextContent('겹치는 활성 차단 2건');
    expect(review).toHaveTextContent(
      '겹치는 활성 차단 2건 · 워크스페이스 전체 · Managed System (50000000)',
    );
  });

  // Decision-control suppression for terminal requests is covered with the real form in
  // routes/_authed/admin/permissions/requests.test.tsx ("cancelled history … no decision controls").
  it('keeps server risk visible on a terminal request', () => {
    const request = adminDetailFixture({ ...REQUEST, status: 'approved' }, false, 'allowed', {
      risk_indicators: [SENSITIVE_SIGNAL],
      allowed_actions: [],
    });

    render(<PermissionRequestDetail request={request} onClose={() => undefined} />);

    expect(screen.getByTestId('permission-request-risk-review')).toHaveTextContent(
      '민감한 권한 · 워크스페이스 관리자 권한',
    );
    const header = screen.getByTestId('permission-request-detail-panel').querySelector('header');
    if (!header) throw new Error('Detail header is missing');
    expect(within(header).getByText('승인됨')).toBeInTheDocument();
  });

  it.each(['approved', 'rejected', 'cancelled'] as const)(
    'marks terminal review facts as current state (%s)',
    (status) => {
      render(
        <PermissionRequestDetail
          request={adminDetailFixture({ ...REQUEST, status })}
          onClose={() => undefined}
        />,
      );
      expect(
        within(screen.getByTestId('permission-request-risk-review')).getByText('현재 상태 기준'),
      ).toBeInTheDocument();
    },
  );

  it('retains the self-approval facts for the reviewer’s own request', () => {
    render(
      <PermissionRequestDetail
        request={adminDetailFixture(REQUEST, true)}
        onClose={() => undefined}
      />,
    );
    const review = within(screen.getByTestId('permission-request-risk-review'));
    expect(review.getByText('본인 요청').parentElement).toHaveTextContent(
      '본인 요청본인 승인 허용 · 사유 필요',
    );
    expect(review.queryByText('본인 승인 정책')).not.toBeInTheDocument();
    expect(review.queryByText('본인 승인 사유 필요')).not.toBeInTheDocument();
  });

  it.each([
    {
      allow: true,
      expiry: '2026-12-31T00:00:00.000Z',
      scope: [CURRENT_SYSTEM_ID],
      expected: '허용 · Role Level · 현재 보유 범위: Power BI · 만료 2026. 12. 31.',
    },
    {
      allow: true,
      expiry: null,
      scope: [CURRENT_SYSTEM_ID],
      expected: '허용 · Role Level · 현재 보유 범위: Power BI · 만료 없음',
    },
    {
      allow: false,
      expiry: null,
      scope: [CURRENT_SYSTEM_ID],
      expected: '명시적 차단 · 현재 보유 범위: Power BI',
    },
    { allow: false, expiry: null, scope: [], expected: '명시적 차단' },
  ])(
    'shows only applicable access scope and labelled expiry ($expected)',
    ({ allow, expiry, scope, expected }) => {
      render(
        <PermissionRequestDetail
          request={adminDetailFixture(REQUEST, false, 'allowed', {
            effective_access: {
              decision: allow
                ? { allow: true, via: 'role' }
                : { allow: false, reason: 'explicit_deny', requestable: null },
              scope: { kind: 'scoped', managed_system_ids: scope },
              expires_at: expiry,
              granted_managed_system_id: null,
            },
          })}
          managedSystemNames={{ [CURRENT_SYSTEM_ID]: 'Power BI' }}
          onClose={() => undefined}
        />,
      );
      const row = screen.getByText('요청 범위의 현재 권한').parentElement;
      expect(row?.textContent).toBe(`요청 범위의 현재 권한${expected}`);
    },
  );

  it('explains constant-evidence signals once through their titles', () => {
    render(
      <PermissionRequestDetail
        request={adminDetailFixture(REQUEST, false, 'allowed', {
          risk_indicators: RISK_INDICATORS.slice(1, 3),
        })}
        onClose={() => undefined}
      />,
    );
    const review = within(screen.getByTestId('permission-request-risk-review'));
    expect(review.getByText('워크스페이스 전체 범위')).toBeInTheDocument();
    expect(review.getByText('요청 만료일 없음')).toBeInTheDocument();
    expect(review.queryByText('요청 범위는 워크스페이스 전체입니다.')).not.toBeInTheDocument();
    expect(review.queryByText('요청 만료일이 없습니다.')).not.toBeInTheDocument();
  });
});
