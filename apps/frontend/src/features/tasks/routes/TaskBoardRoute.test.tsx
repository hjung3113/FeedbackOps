import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';

const task = {
  id: '10000000-0000-0000-0000-000000000001', workspace_id: '90000000-0000-0000-0000-000000000009', display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003', title: '매출 리포트 쿼리 플랜 개선', status: 'backlog' as const,
  priority: 'high' as const, assignee_actor_id: null, due_date: null, milestone_id: null, analytics_area_id: null, source_task_request_id: null,
  created_by: '20000000-0000-0000-0000-000000000002', created_at: '2026-07-10T00:00:00.000Z', updated_at: '2026-07-10T00:00:00.000Z',
};
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return { ...actual, WorkbenchShell: ({ children, detailPanel }: { children: React.ReactNode; detailPanel?: React.ReactNode }) => <div>{children}<aside>{detailPanel}</aside></div> };
});
vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: vi.fn(async () => ({ items: [{ id: task.primary_managed_system_id, name: 'Billing Ops', archived_at: null }] })) }));
vi.mock('@/lib/api/tasks', () => ({ listTasks: vi.fn(async () => ({ items: [task] })), updateTaskStatus: vi.fn() }));
vi.mock('./TaskListRoute', () => ({ TaskDetailPanel: ({ taskId }: { taskId: string }) => <div>detail {taskId}</div> }));

function renderBoard(selectedParam?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TaskBoardRoute selectedParam={selectedParam} /></QueryClientProvider>);
}

describe('TaskBoardRoute', () => {
  it('renders all seven status columns and an empty placeholder', async () => {
    renderBoard();
    await screen.findByText('TASK-1000');
    for (const status of ['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened']) {
      expect(screen.getByLabelText(`${status[0]!.toUpperCase()}${status.slice(1)} column`)).toBeInTheDocument();
    }
    expect(screen.getAllByText('비어있음').length).toBe(6);
  });

  it('restores the board selected detail from the URL parameter', async () => {
    renderBoard(task.id);
    await waitFor(() => expect(screen.getByText(`detail ${task.id}`)).toBeInTheDocument());
  });
});
