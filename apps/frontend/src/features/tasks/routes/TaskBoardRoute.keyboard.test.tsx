import { listTasks, updateTaskStatus } from '@/lib/api/tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';

const task = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: 'Keyboard draggable Task',
  status: 'backlog' as const,
  priority: 'high' as const,
  assignee_actor_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '20000000-0000-0000-0000-000000000002',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

const navigate = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/api/tasks', () => ({
  listTasks: vi.fn(),
  updateTaskStatus: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    WorkbenchShell: ({
      toolbar,
      children,
      detailPanel,
    }: {
      toolbar: { title: React.ReactNode; actions: React.ReactNode };
      children: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div>
        <header>
          {toolbar.title}
          {toolbar.actions}
        </header>
        {children}
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

function boardRect(left: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: 0,
    top: 0,
    left,
    right: left + width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('TaskBoardRoute keyboard dragging', () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockResolvedValue({ items: [task] });
    vi.mocked(updateTaskStatus).mockImplementation(() => new Promise(() => {}));
    navigate.mockReset();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const label = this.getAttribute('aria-label');
      if (label === 'Backlog 열') return boardRect(0, 288, 600);
      if (label === 'Doing 열') return boardRect(300, 288, 600);
      if (label?.startsWith('TASK-1000:')) return boardRect(16, 256, 72);
      return boardRect(0, 0, 0);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('moves a rendered Task from Backlog to Doing with the keyboard sensor', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );

    const card = await screen.findByRole('button', { name: 'TASK-1000: Keyboard draggable Task' });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    for (let step = 0; step < 13; step += 1) {
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    }
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith(
        task.id,
        'doing',
        expect.objectContaining({ ifMatch: task.updated_at, idempotencyKey: expect.any(String) }),
      ),
    );
    expect(screen.getByLabelText('Doing 열')).toHaveTextContent(task.display_id);
  });
});
