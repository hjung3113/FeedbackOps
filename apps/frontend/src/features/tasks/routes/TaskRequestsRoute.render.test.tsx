import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/features/integration/hooks/useFindingDetail', () => ({
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

vi.mock('@/lib/api', () => {
  const taskRequest = {
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
  };
  return {
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
  };
});

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
});
