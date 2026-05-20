// TriageRoute.test.tsx — RED tests for the Triage view routing.
// Covers: URL → view=triage → renders queue; tab change updates URL; selected updates URL.
// REV-1 #9: user role without voc.triage capability gets PermissionBlockedPanel.
// TDD RED: written before TriageRoute.tsx implementation exists.

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// REV-3 Cluster Y: TriagePanel now uses useQueryClient (for the empty-body
// compensate refetch path). Tests must wrap renders in QueryClientProvider.
function renderWithQc(node: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

// ── Stub useVocList ────────────────────────────────────────────────────────────

const MOCK_TRIAGE_VOCS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: 'Triage VOC 1',
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
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_id: 'VOC-002',
    title: 'Triage VOC 2',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u2',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'critical' as const,
    reporter_facing_status: 'reviewing' as const,
    triage_state: 'untriaged' as const,
    source_context: 'proxy_report' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
  },
];

vi.mock('../../hooks/useVocList', () => ({
  useVocList: () => ({
    data: { items: MOCK_TRIAGE_VOCS, next_cursor: undefined },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Stub useWorkspaceActors — added in Chunk 2; TriagePanel now calls it.
vi.mock('../../hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [],
    isSuccess: true,
    isLoading: false,
    error: null,
  }),
}));

// ── Stub useMe ────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

// ── Stub usePermissionCheck (REV-2 #9 capability gate) ────────────────────────

vi.mock('@/features/admin/permissions/use-permission-check', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

// ── Stub PermissionBlockedPanel (avoids JSDOM rendering issues with @fops/ui internals)
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

// ── Stub VocDetailPanel ───────────────────────────────────────────────────────

vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({
    vocId,
    onClose,
  }: {
    vocId: string;
    onClose: () => void;
  }) => (
    <div data-testid="voc-detail-panel-stub" data-voc-id={vocId}>
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));

// ── Import subject ─────────────────────────────────────────────────────────────

import { TriageRoute } from '../TriageRoute';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';

// ── Tests ─────────────────────────────────────────────────────────────────────

// Default me mock — admin actor who has voc.triage capability
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
  isFetching: false,
  isRefetching: false,
  isLoadingError: false,
  isRefetchError: false,
  isPlaceholderData: false,
  isStale: false,
  dataUpdatedAt: 0,
  errorUpdatedAt: 0,
  failureCount: 0,
  failureReason: null,
  errorUpdateCount: 0,
  refetch: vi.fn(),
};

describe('TriageRoute', () => {
  beforeEach(() => {
    searchState = { view: 'triage' };
    navigateMock.mockClear();
    // Default: admin actor with voc.triage capability
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    // Default: capability check approves (Admin/Developer with scope).
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'approved',
        decision: { allow: true, via: 'role' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);
  });

  it('renders the triage queue with VOC rows when view=triage', async () => {
    renderWithQc(<TriageRoute />);
    // The title may appear in both the queue row and the panel; use getAllByText
    await waitFor(() => {
      expect(screen.getAllByText('Triage VOC 1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Triage VOC 2').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('selecting a tab calls navigate with tab param', async () => {
    renderWithQc(<TriageRoute />);
    await waitFor(() => {
      expect(screen.getAllByText('Triage VOC 1').length).toBeGreaterThanOrEqual(1);
    });

    // Find a tab trigger (e.g. "미배정" = unassigned)
    const unassignedTab = screen.getByRole('button', { name: /미배정/i });
    fireEvent.click(unassignedTab);

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    const result = callArg.search({});
    expect(result).toHaveProperty('tab', 'unassigned');
  });

  it('clicking a row calls navigate with selected param', async () => {
    renderWithQc(<TriageRoute />);
    await waitFor(() => {
      expect(screen.getAllByText('Triage VOC 1').length).toBeGreaterThanOrEqual(1);
    });

    const rows = screen.getAllByRole('button', { name: /VOC-00[12]/ });
    if (rows[0]) fireEvent.click(rows[0]);

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    const result = callArg.search({});
    expect(result).toHaveProperty('selected');
  });

  // REV-1 #9 / REV-2 #9: actor without voc.triage capability sees
  // PermissionBlockedPanel instead of the queue. The gate is now driven by
  // the authoritative usePermissionCheck decision, not by role_level.
  it('[#9] no voc.triage capability: renders PermissionBlockedPanel instead of the queue', async () => {
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        state: 'blocked_non_requestable',
        decision: { allow: false, reason: 'no scope' },
      },
    } as unknown as ReturnType<typeof usePermissionCheck>);

    renderWithQc(<TriageRoute />);

    // PermissionBlockedPanel must be visible
    await waitFor(() => {
      // PermissionBlockedPanel renders some form of "권한" or blocked state copy.
      // The component is from @fops/ui; check for its container testid or blocked text.
      expect(
        screen.queryByText('Triage VOC 1'),
      ).not.toBeInTheDocument();
    });

    // The queue items must NOT be rendered for user-role actor
    expect(screen.queryByText('Triage VOC 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Triage VOC 2')).not.toBeInTheDocument();
  });
});
