// TriageRoute.queuePending.test.tsx — #922 item 2
//
// Arrowing to a tab whose list is not cached used to swap the whole screen for
// the route-level loading state. The tablist unmounted and focus fell to
// <body>. The pending state must live at the queue level so the tab strip
// stays mounted and the focused tab keeps focus.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/lib/api/nav', () => ({
  fetchNavCounts: vi.fn(),
}));

const useVocListMock = vi.fn();
vi.mock('../../hooks/useVocList', () => ({
  useVocList: (...args: unknown[]) => useVocListMock(...args),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true, isLoading: false, error: null }),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

import { fetchNavCounts } from '@/lib/api/nav';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { TriageRoute } from '../TriageRoute';

const ADMIN_ME = {
  data: {
    actor: {
      id: 'admin-uuid-1',
      external_id: 'admin-1',
      email: 'admin@test.local',
      display_name: '관리자',
      role_level: 'admin',
    },
    workspace_id: 'ws-1',
  },
  isLoading: false,
  isError: false,
  isPending: false,
  isSuccess: true,
  error: null,
  status: 'success' as const,
  fetchStatus: 'idle' as const,
};

const QUEUED_VOC = {
  id: '00000000-0000-0000-0000-0000000000aa',
  display_id: 'VOC-101',
  title: 'Queued VOC',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'u1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high' as const,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
};

describe('TriageRoute — pending tab keeps the screen mounted (#922)', () => {
  let qc: QueryClient;

  function renderRoute() {
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={qc}>
        <TriageRoute />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    searchState = { view: 'triage' };
    navigateMock.mockClear();
    useVocListMock.mockReset();
    vi.mocked(fetchNavCounts)
      .mockReset()
      .mockResolvedValue({ counts: { 'voc.triage': 7 } });
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'approved',
        decision: { allow: true, via: 'role' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);
    // The default tab is cached; every other tab is still loading.
    useVocListMock.mockImplementation((params: { tab?: string }) =>
      params.tab === undefined || params.tab === 'unassigned'
        ? {
            data: { items: [QUEUED_VOC], next_cursor: undefined },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          }
        : { data: undefined, isLoading: true, error: null, refetch: vi.fn() },
    );
  });

  it('keeps the tablist in the document and the focused tab focused while the next tab loads', async () => {
    const view = renderRoute();
    const unassignedTab = await screen.findByRole('tab', { name: /미배정/ });
    unassignedTab.focus();
    expect(document.activeElement).toBe(unassignedTab);

    searchState = { view: 'triage', tab: 'untriaged' };
    view.rerender(
      <QueryClientProvider client={qc}>
        <TriageRoute />
      </QueryClientProvider>,
    );

    // The tab strip survived the refetch...
    expect(view.getByRole('tablist')).toBeInTheDocument();
    expect(view.getByRole('tab', { name: /미분류/ })).toHaveAttribute('aria-selected', 'true');
    // ...and the same trigger node kept focus — no route-level screen swap.
    expect(document.activeElement).toBe(unassignedTab);

    // The pending state lives in the queue column, not at the route level.
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByText('큐가 비었습니다')).not.toBeInTheDocument();
    expect(screen.queryByText('Queued VOC')).not.toBeInTheDocument();
  });
});
