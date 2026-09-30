import type { AdminPermissionRequestRow } from '@/lib/api';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../permission-request-decision-form.js', () => ({
  PermissionRequestDecisionForm: () => null,
}));

import { PermissionRequestDetail } from '../permission-request-detail.js';

const REQUEST: AdminPermissionRequestRow = {
  id: '10000000-0000-0000-0000-000000000001',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  requested_capability: 'finding.manage',
  requested_managed_system_id: '30000000-0000-0000-0000-000000000003',
  reason: 'Finding access needed for review.',
  status: 'pending',
  created_at: '2026-07-10T00:00:00.000Z',
};

describe('PermissionRequestDetail identity', () => {
  it('leads with requester and readable capability in a two-line header', () => {
    render(
      <PermissionRequestDetail
        request={REQUEST}
        actorName="김하나"
        managedSystemName="Billing Ops"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText('김하나 · Finding 관리')).toBeInTheDocument();
    expect(screen.getByText('finding.manage')).toHaveClass('font-mono', 'text-text-muted');
    expect(screen.getByText('김하나')).toBeInTheDocument();
    expect(screen.getByText('Billing Ops')).toBeInTheDocument();
    expect(screen.getByText('10000000').closest('header')).toBeNull();
    expect(screen.getByText('10000000')).toHaveClass('font-mono', 'text-xs', 'text-text-muted');
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
    expect(screen.queryByText('30000000')).not.toBeInTheDocument();

    const header = screen.getByText('Permission Request').closest('header');
    expect(header?.querySelectorAll('p')).toHaveLength(2);
  });

  it('uses safe labels when actor and Managed System names are unavailable', () => {
    render(<PermissionRequestDetail request={REQUEST} onClose={() => undefined} />);

    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
    expect(screen.getByText('Managed System')).toBeInTheDocument();
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
    expect(screen.getByText('30000000')).toHaveClass('text-text-muted');
  });
});
