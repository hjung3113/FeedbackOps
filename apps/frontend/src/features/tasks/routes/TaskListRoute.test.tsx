import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getTask, listTasks } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { TaskDetailPanel, TaskListRoute } from './TaskListRoute';

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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [{ id: '20000000-0000-0000-0000-000000000002', display_name: '담당자' }],
  }),
}));

vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [
      {
        id: '30000000-0000-0000-0000-000000000003',
        name: 'Billing Ops',
        archived_at: null,
      },
    ],
  })),
}));

vi.mock('@/lib/api', () => {
  const task = {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'TASK-1000',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: '매출 리포트 쿼리 플랜 개선',
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: '20000000-0000-0000-0000-000000000002',
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
  return {
    listTasks: vi.fn(async () => ({ items: [task] })),
    getTask: vi.fn(async () => ({
      ...task,
      source: {
        finding: {
          id: '40000000-0000-0000-0000-000000000004',
          display_id: 'FIN-179',
          title: '리포트 속도 저하',
          summary: '쿼리 플랜 개선 필요',
          evidence_count: 3,
        },
      },
    })),
  };
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TaskListRoute display ids', () => {
  it('renders task display_id in the list row, detail header, and link trail', async () => {
    renderWithClient(<TaskListRoute />);

    await waitFor(() => {
      expect(screen.getAllByText('TASK-1000').length).toBeGreaterThan(0);
    });
    expect(await screen.findByText('FIN-179')).toBeInTheDocument();
    expect(screen.queryByText(/10000000/)).not.toBeInTheDocument();
  });

  it('renders permission denied instead of the list unavailable copy for a 403', async () => {
    vi.mocked(listTasks).mockRejectedValueOnce(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage capability required' }),
    );
    renderWithClient(<TaskListRoute />);

    const panel = await screen.findByText('Task list');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByText('Task list unavailable.')).not.toBeInTheDocument();
  });

  it('keeps a non-permission list failure unavailable', async () => {
    vi.mocked(listTasks).mockRejectedValueOnce(
      new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    );
    renderWithClient(<TaskListRoute />);

    expect(await screen.findByText('Task list unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });

  it('renders permission denied instead of task detail unavailable for a 403', async () => {
    vi.mocked(getTask).mockRejectedValueOnce(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage capability required' }),
    );
    renderWithClient(
      <TaskDetailPanel
        taskId="10000000-0000-0000-0000-000000000001"
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        onClose={vi.fn()}
      />,
    );

    const panel = await screen.findByText('Task detail');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByText('Task detail unavailable.')).not.toBeInTheDocument();
  });

  it('keeps a non-permission task detail failure unavailable', async () => {
    vi.mocked(getTask).mockRejectedValueOnce(
      new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
    );
    renderWithClient(
      <TaskDetailPanel
        taskId="10000000-0000-0000-0000-000000000001"
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('Task detail unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });
});
