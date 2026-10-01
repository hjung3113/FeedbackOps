import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const consoleState = vi.hoisted(() => {
  let activeTab = 'pending';
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
    loadedRequests: requests,
    get activeTab() {
      return activeTab;
    },
    setActiveTab(next: string) {
      activeTab = next;
    },
    selected: null,
    selectedId: null,
    actorNames: {},
    managedSystemNames: {},
    isPending: false,
    isError: false,
    handleTabChange: vi.fn((next: string) => {
      activeTab = next;
    }),
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
  beforeEach(() => {
    consoleState.setActiveTab('pending');
    consoleState.handleTabChange.mockClear();
  });

  it('uses shared tabs with bare status counts and forwards tab selection', () => {
    render(<PermissionRequestsScreen />);

    expect(screen.getByRole('tablist', { name: '권한 요청 상태' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '대기 중 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '승인됨 0' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '대기 중 (1)' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: '승인됨 0' }));

    expect(consoleState.handleTabChange).toHaveBeenCalledWith('approved');
  });

  it('associates the selected tab with the real list panel after a tab change', () => {
    const { rerender } = render(<PermissionRequestsScreen />);
    const pendingTab = screen.getByRole('tab', { name: '대기 중 1' });
    let panel = screen.getByRole('tabpanel');
    expect(pendingTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(pendingTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', pendingTab.id);

    fireEvent.mouseDown(screen.getByRole('tab', { name: '승인됨 0' }));
    rerender(<PermissionRequestsScreen />);

    const approvedTab = screen.getByRole('tab', { name: '승인됨 0' });
    panel = screen.getByRole('tabpanel');
    expect(approvedTab).toHaveAttribute('aria-selected', 'true');
    expect(approvedTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(approvedTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', approvedTab.id);
  });
});

// #706 — tab counts are unknown until the requests read succeeds; unknown must
// never render as 0.
describe('PermissionRequestsScreen tab counts (#706)', () => {
  beforeEach(() => {
    consoleState.setActiveTab('pending');
  });

  afterEach(() => {
    consoleState.isPending = false;
    consoleState.isError = false;
    consoleState.allRequests = consoleState.loadedRequests;
    consoleState.visibleRequests = consoleState.loadedRequests;
  });

  it.each(['pending', 'failed', 'loaded', 'loaded-empty'] as const)(
    'shows tab counts only after the requests read succeeds (%s)',
    (state) => {
      consoleState.isPending = state === 'pending';
      consoleState.isError = state === 'failed';
      consoleState.allRequests = state === 'loaded-empty' ? [] : consoleState.loadedRequests;
      consoleState.visibleRequests = state === 'loaded-empty' ? [] : consoleState.loadedRequests;

      render(<PermissionRequestsScreen />);

      expect(screen.getByRole('tablist', { name: '권한 요청 상태' })).toBeInTheDocument();
      if (state === 'pending' || state === 'failed') {
        expect(screen.getByRole('tab', { name: '대기 중' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^대기 중 \d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^승인됨 \d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^전체 \d+$/ })).not.toBeInTheDocument();
        return;
      }
      const pending = state === 'loaded-empty' ? 0 : 1;
      expect(screen.getByRole('tab', { name: `대기 중 ${pending}` })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: '승인됨 0' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: `전체 ${pending}` })).toBeInTheDocument();
    },
  );
});
