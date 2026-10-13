import { listTasks, updateTaskStatus } from '@/lib/api/tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  assignee_team_id: null,
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

describe('TaskBoardRoute keyboard recovery scope', () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockResolvedValue({ items: [task] });
    vi.mocked(updateTaskStatus).mockImplementation(() => new Promise(() => {}));
    navigate.mockReset();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const label = this.getAttribute('aria-label');
      const index = [
        'Backlog',
        'Todo',
        'Doing',
        'Review',
        'Done',
        'Released',
        'Reopened',
      ].findIndex((status) => label === `${status} 열`);
      if (index >= 0) return boardRect(index * 300, 288, 600);
      if (
        label?.startsWith('TASK-1000:') ||
        (this.getAttribute('aria-hidden') === 'true' && this.textContent?.includes(task.title))
      )
        return boardRect(16, 256, 72);
      return boardRect(0, 0, 0);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['groupBy', 'managedSystem', 'publicUpdate'] as const)(
    'abandons a pending destination and its later rejection after %s changes',
    async (scope) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let releaseCancellation!: () => void;
      vi.spyOn(client, 'cancelQueries').mockReturnValue(
        new Promise<void>((resolve) => {
          releaseCancellation = resolve;
        }),
      );
      let rejectUpdate!: (error: Error) => void;
      vi.mocked(updateTaskStatus).mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectUpdate = reject;
          }),
      );
      const board = (props: React.ComponentProps<typeof TaskBoardRoute> = {}) => (
        <QueryClientProvider client={client}>
          <TaskBoardRoute {...props} />
        </QueryClientProvider>
      );
      const view = render(board());
      const card = await screen.findByRole('button', { name: /TASK-1000:/ });
      card.focus();
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
      expect(screen.getByRole('status')).toHaveTextContent(
        'TASK-1000 Task가 Todo 열 위에 있습니다.',
      );
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      expect(screen.getByLabelText('Todo 열')).not.toHaveTextContent(task.display_id);
      card.blur();
      if (scope === 'groupBy') {
        fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
        fireEvent.click(await screen.findByRole('radio', { name: '우선순위' }));
        fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
        fireEvent.click(await screen.findByRole('radio', { name: '상태 (기본)' }));
      } else {
        view.rerender(
          board(
            scope === 'managedSystem'
              ? { managedSystem: task.primary_managed_system_id }
              : { publicUpdate: 'missing' },
          ),
        );
        await screen.findByRole('button', { name: /TASK-1000:/ });
        view.rerender(board());
      }
      // Popover dismissal can focus its trigger; exercise the body-focus path.
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();
      await act(async () => {
        releaseCancellation();
      });
      await within(screen.getByLabelText('Todo 열')).findByRole('button', { name: /TASK-1000:/ });
      await waitFor(() => expect(updateTaskStatus).toHaveBeenCalled());
      expect(document.body).toHaveFocus();
      await act(async () => {
        rejectUpdate(new Error('Older scope move rejected'));
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
      await within(screen.getByLabelText('Backlog 열')).findByRole('button', {
        name: /TASK-1000:/,
      });
      expect(document.body).toHaveFocus();
    },
  );
});
