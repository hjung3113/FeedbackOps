import type { AdminPermissionRequestRow } from '@/lib/api';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const consoleState = vi.hoisted(() => ({
  allRequests: [
    {
      id: '10000000-0000-0000-0000-000000000001',
      requester_actor_id: '20000000-0000-0000-0000-000000000002',
      requested_capability: 'finding.manage',
      requested_managed_system_id: '30000000-0000-0000-0000-000000000003',
      reason: 'Finding access needed for review.',
      status: 'pending',
      created_at: '2026-07-10T00:00:00.000Z',
    },
  ] as AdminPermissionRequestRow[],
  visibleRequests: [] as AdminPermissionRequestRow[],
  activeTab: 'pending' as const,
  selected: null as AdminPermissionRequestRow | null,
  selectedId: null as string | null,
  actorNames: { '20000000-0000-0000-0000-000000000002': '김하나' } as Record<string, string>,
  managedSystemNames: { '30000000-0000-0000-0000-000000000003': 'Billing Ops' } as Record<
    string,
    string
  >,
  isPending: false,
  isError: false,
  handleTabChange: vi.fn(),
  handleSelect: vi.fn(),
  handleClose: vi.fn(),
}));
consoleState.visibleRequests = consoleState.allRequests;

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({ list }: { list: ReactNode }) => <main>{list}</main>,
  };
});

vi.mock('../use-permission-requests-console.js', () => ({
  usePermissionRequestsConsole: () => consoleState,
}));

import { PermissionRequestsScreen } from '../permission-requests-screen.js';

describe('PermissionRequestsScreen identity', () => {
  beforeEach(() => {
    consoleState.actorNames = { '20000000-0000-0000-0000-000000000002': '김하나' };
    consoleState.managedSystemNames = { '30000000-0000-0000-0000-000000000003': 'Billing Ops' };
  });

  it('leads with the capability and readable requester/scope names', () => {
    render(<PermissionRequestsScreen />);

    expect(screen.getByRole('button', { name: /finding.manage/ })).toBeInTheDocument();
    expect(screen.getByText('권한 요청')).toBeInTheDocument();
    expect(screen.getByText('김하나')).toBeInTheDocument();
    expect(screen.getByText('Billing Ops')).toBeInTheDocument();
    expect(screen.queryByText('20000000')).not.toBeInTheDocument();
    expect(screen.queryByText('30000000')).not.toBeInTheDocument();
    expect(screen.getByText('10000000')).toHaveClass('text-text-muted');
  });

  it('uses safe requester and Managed System labels when lookups have no names', () => {
    consoleState.actorNames = {};
    consoleState.managedSystemNames = {};

    render(<PermissionRequestsScreen />);

    expect(screen.getByText('알 수 없는 사용자')).toBeInTheDocument();
    expect(screen.getByText('Managed System')).toBeInTheDocument();
    expect(screen.getByText('20000000')).toHaveClass('font-mono');
    expect(screen.getByText('30000000')).toHaveClass('font-mono');
  });
});
