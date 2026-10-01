import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const consoleState = vi.hoisted(() => {
  const requests = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      requester_actor_id: '20000000-0000-0000-0000-000000000002',
      requested_capability: 'finding.manage',
      requested_managed_system_id: null,
      reason: 'Finding access needed for review.',
      status: 'pending',
      created_at: '2026-07-10T00:00:00.000Z',
    },
  ];
  return {
    allRequests: requests,
    visibleRequests: requests,
    activeTab: 'pending' as const,
    selected: null,
    selectedId: null,
    actorNames: {},
    managedSystemNames: {},
    isPending: false,
    isError: false,
    handleTabChange: vi.fn(),
    handleSelect: vi.fn(),
    handleClose: vi.fn(),
  };
});

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({ tabs, list }: { tabs: ReactNode; list: ReactNode }) => (
      <main>
        {tabs}
        {list}
      </main>
    ),
  };
});

vi.mock('../use-permission-requests-console.js', () => ({
  usePermissionRequestsConsole: () => consoleState,
}));

import { PermissionRequestsScreen } from '../permission-requests-screen.js';

describe('PermissionRequestsScreen tabs', () => {
  it('uses shared tabs with bare status counts and forwards tab selection', () => {
    render(<PermissionRequestsScreen />);

    expect(screen.getByRole('tablist', { name: '권한 요청 상태' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '대기 중 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '승인됨 0' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '대기 중 (1)' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: '승인됨 0' }));

    expect(consoleState.handleTabChange).toHaveBeenCalledWith('approved');
  });
});
