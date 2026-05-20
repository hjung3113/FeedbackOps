// TriageRoute.capability.test.tsx — codex REV-2 P1 #9 + NEW-3
//
// REV-1's gate was role_level !== 'user'. That allowed a Developer (or any
// non-'user' role label) to enter the triage queue even when their actual
// voc.triage capability scope was empty. Per docs/design/09-permission-access.md
// the frontend must not derive authorization from display labels — capability
// is the authoritative signal. The fix wires the route to
// usePermissionCheck({ capability: 'voc.triage' }) and renders
// PermissionBlockedPanel for any non-approved state. The gate also runs
// BEFORE the triage queue fetch so a blocked actor never triggers a query.

import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const useVocListMock = vi.fn();
vi.mock('../../hooks/useVocList', () => ({
  useVocList: (...args: unknown[]) => useVocListMock(...args),
}));

vi.mock('../../hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true, isLoading: false, error: null }),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

// Mock the permission check hook (Group 5 wires this in).
vi.mock('@/features/admin/permissions/use-permission-check', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    PermissionBlockedPanel: ({
      category,
      reason,
    }: {
      category: string;
      reason?: string;
    }) => (
      <div data-testid="permission-blocked-panel">
        <span>{category}</span>
        {reason && <span>{reason}</span>}
      </div>
    ),
  };
});

vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({ vocId }: { vocId: string }) => (
    <div data-testid="voc-detail-panel-stub" data-voc-id={vocId} />
  ),
}));

import { TriageRoute } from '../TriageRoute';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DEVELOPER_ME = {
  data: {
    actor: {
      id: 'developer-uuid-1',
      external_id: 'dev-1',
      email: 'dev@test.local',
      display_name: '개발자',
      role_level: 'developer',
    },
    workspace_id: 'ws-1',
  },
  isLoading: false,
  isPending: false,
  isSuccess: true,
  status: 'success' as const,
};

describe('TriageRoute capability gate (REV-2 #9 + NEW-3)', () => {
  beforeEach(() => {
    searchState = { view: 'triage' };
    navigateMock.mockClear();
    useVocListMock.mockClear();
    useVocListMock.mockReturnValue({
      data: { items: [], next_cursor: undefined },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useMe).mockReturnValue(DEVELOPER_ME as unknown as ReturnType<typeof useMe>);
  });

  it('Developer WITHOUT voc.triage capability sees PermissionBlockedPanel', async () => {
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'blocked_non_requestable',
        decision: { allow: false, reason: 'no scope' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);

    render(<TriageRoute />);

    await waitFor(() => {
      expect(screen.getByTestId('permission-blocked-panel')).toBeInTheDocument();
    });
  });

  it('Admin WITH voc.triage approved sees the queue', async () => {
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'approved',
        decision: { allow: true, via: 'role' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);

    useVocListMock.mockReturnValue({
      data: {
        items: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            display_id: 'VOC-001',
            title: 'Approved queue VOC',
            primary_managed_system_id: 'ms-1',
            analytics_area_id: null,
            reporter_id: 'u1',
            owner_user_id: null,
            owner_team_id: null,
            severity: 'high',
            reporter_facing_status: 'received',
            triage_state: 'untriaged',
            source_context: 'direct_use',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            similar_count: 0,
          },
        ],
        next_cursor: undefined,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TriageRoute />);

    await waitFor(() => {
      // Title appears at least once (queue row).
      expect(screen.getAllByText('Approved queue VOC').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not fetch the triage queue when permission check is blocked', async () => {
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'blocked_non_requestable',
        decision: { allow: false, reason: 'no scope' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);

    render(<TriageRoute />);

    // useVocList must have been called with enabled:false (or not at all
    // executing the query). We assert on the queryFn never firing by checking
    // that the hook was called with enabled === false.
    const call = useVocListMock.mock.calls[0];
    expect(call).toBeDefined();
    const params = call?.[0] as { enabled?: boolean } | undefined;
    expect(params?.enabled).toBe(false);
  });
});
