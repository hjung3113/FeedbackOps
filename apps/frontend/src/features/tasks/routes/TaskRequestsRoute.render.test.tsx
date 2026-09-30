import { fetchTaskRequests } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRequestsRoute } from './TaskRequestsRoute';

vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: {
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({
    data: {
      id: '40000000-0000-0000-0000-000000000004',
      display_id: 'FIN-179',
      title: '리포트 속도 저하',
      status: 'active',
    },
  }),
}));

vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: '30000000-0000-0000-0000-000000000003', name: 'Billing Ops' }],
  })),
}));

const { taskRequest } = vi.hoisted(() => ({
  taskRequest: {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'REQ-42',
    source_type: 'finding',
    source_id: '40000000-0000-0000-0000-000000000004',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    evidence_summary: '쿼리 플랜 개선 필요',
    requested_outcome: 'Task 전환 검토',
    requester_actor_id: '20000000-0000-0000-0000-000000000002',
    status: 'pending_review',
    reviewer_actor_id: null,
    decision_reason: null,
    decided_at: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    source: {
      type: 'finding',
      id: '40000000-0000-0000-0000-000000000004',
      display_id: 'FIN-179',
      relation_type: 'requested_task',
      link_id: '70000000-0000-0000-0000-000000000007',
    },
  } as TaskRequestDto,
}));

vi.mock('@/lib/api', () => ({
  approveTaskRequest: vi.fn(),
  convertTaskRequest: vi.fn(),
  fetchMe: vi.fn(async () => ({
    actor: {
      id: '60000000-0000-0000-0000-000000000006',
      role_level: 'admin',
    },
  })),
  fetchPermissionCheck: vi.fn(async () => ({ state: 'approved' })),
  fetchTaskRequests: vi.fn(async () => ({ items: [taskRequest] })),
  linkExistingTask: vi.fn(),
  listTasks: vi.fn(async () => ({ items: [] })),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
  resolveActors: vi.fn(async () => ({
    actors: [
      {
        id: '20000000-0000-0000-0000-000000000002',
        display_name: '요청자',
        email: 'requester@example.test',
      },
    ],
    teams: [],
  })),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TaskRequestsRoute display ids', () => {
  it('renders task request display_id in the row and detail header, and finding display_id in the source card', async () => {
    renderWithClient(<TaskRequestsRoute />);

    await waitFor(() => {
      expect(screen.getAllByText('REQ-42').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('FIN-179')).toBeInTheDocument();
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('does not render a severity stripe derived from Task Request status', async () => {
    renderWithClient(<TaskRequestsRoute />);

    const row = await screen.findByRole('button', { name: /REQ-42/ });
    expect(row.querySelector('[data-token^="--severity-"]')).not.toBeInTheDocument();
  });

  it('omits the unsupported Impact property from Task Request detail', async () => {
    renderWithClient(<TaskRequestsRoute />);

    await screen.findByText('Self-approval');
    expect(screen.queryByText('Impact')).not.toBeInTheDocument();
  });

  it('shows the default empty queue without a filter-reset action', async () => {
    vi.mocked(fetchTaskRequests).mockResolvedValueOnce({ items: [] });
    renderWithClient(<TaskRequestsRoute />);

    expect(await screen.findByText('Task Request가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('검토 요청이 접수되면 이 목록에 표시됩니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  it('shows pending-specific copy when only other statuses have requests', async () => {
    vi.mocked(fetchTaskRequests).mockResolvedValueOnce({
      items: [
        { ...taskRequest, status: 'approved' },
        {
          ...taskRequest,
          id: '10000000-0000-0000-0000-000000000002',
          display_id: 'REQ-43',
          status: 'rejected',
        },
      ],
    });
    renderWithClient(<TaskRequestsRoute />);

    expect(await screen.findByText('검토 대기 중인 Task Request가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('다른 상태의 Task Request가 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('Task Request가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  it('resets an empty non-default status tab to the default Pending tab', async () => {
    renderWithClient(<TaskRequestsRoute />);

    await screen.findByText('REQ-42');
    await userEvent.click(screen.getByRole('tab', { name: 'Approved' }));

    expect(await screen.findByText('현재 조건에 맞는 Task Request가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('선택한 상태: Approved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(screen.getByRole('tab', { name: /^Pending/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: /REQ-42/ })).toBeInTheDocument();
    expect(screen.queryByText('현재 조건에 맞는 Task Request가 없습니다')).not.toBeInTheDocument();
  });

  it('renders permission denied instead of the queue unavailable copy for a 403', async () => {
    vi.mocked(fetchTaskRequests).mockRejectedValueOnce(
      new ApiError(403, {
        code: 'permission.denied',
        message: 'finding.manage capability required',
      }),
    );
    renderWithClient(<TaskRequestsRoute />);

    const panel = await screen.findByText('Task Request queue');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(
      screen.getByText(
        'Task Request 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('finding.manage capability required')).not.toBeInTheDocument();
    expect(screen.queryByText('Task Request 목록을 불러오지 못했습니다')).not.toBeInTheDocument();
  });

  it('keeps a non-permission queue failure unavailable', async () => {
    vi.mocked(fetchTaskRequests).mockRejectedValueOnce(
      new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    );
    renderWithClient(<TaskRequestsRoute />);

    expect(await screen.findByText('Task Request 목록을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();

    const attemptsBeforeRetry = vi.mocked(fetchTaskRequests).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('button', { name: /REQ-42/ })).toBeInTheDocument();
    expect(vi.mocked(fetchTaskRequests).mock.calls.length).toBeGreaterThan(attemptsBeforeRetry);
  });
});
