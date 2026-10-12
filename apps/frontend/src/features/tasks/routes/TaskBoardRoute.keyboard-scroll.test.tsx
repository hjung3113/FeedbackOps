import { listTasks, updateTaskStatus } from '@/lib/api/tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('TaskBoardRoute scrolled keyboard dragging', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    [
      'done',
      787,
      ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight'],
      ['Review', 'Doing', 'Todo', 'Doing'],
      'doing',
    ],
    [
      'doing',
      300,
      ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft'],
      ['Review', 'Done', 'Released', 'Done'],
      'done',
    ],
  ] as const)(
    'moves one column per press from %s at scrollLeft=%s and drops in the announced column',
    async (origin, initialScroll, directions, destinations, finalStatus) => {
      vi.mocked(listTasks).mockResolvedValue({ items: [{ ...task, status: origin }] });
      vi.mocked(updateTaskStatus).mockImplementation(() => new Promise(() => {}));
      const statuses = ['Backlog', 'Todo', 'Doing', 'Review', 'Done', 'Released', 'Reopened'];
      let board: HTMLElement | null = null;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this === board) return boardRect(292, 1147, 600);
        const index = statuses.findIndex(
          (status) => this.getAttribute('aria-label') === `${status} 열`,
        );
        if (this.hasAttribute('data-task-board-column')) {
          return boardRect(292 + index * 300 - (board?.scrollLeft ?? 0), 288, 600);
        }
        if (
          this.style.position === 'fixed' ||
          this.getAttribute('aria-label')?.startsWith('TASK-1000:') ||
          (this.getAttribute('aria-hidden') === 'true' && this.textContent?.includes(task.title))
        ) {
          const overlay = this.closest<HTMLElement>('[style*="position: fixed"]');
          if (overlay) return boardRect(Number.parseFloat(overlay.style.left), 256, 72);
          return boardRect(
            308 +
              statuses.findIndex((status) => status.toLowerCase() === origin) * 300 -
              (board?.scrollLeft ?? 0),
            256,
            72,
          );
        }
        return boardRect(0, 0, 0);
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <TaskBoardRoute />
        </QueryClientProvider>,
      );
      const card = await screen.findByRole('button', { name: /TASK-1000:/ });
      board = screen.getByLabelText('Backlog 열').parentElement;
      if (!board) throw new Error('Missing board scroller');
      const scroller = board;
      scroller.scrollLeft = initialScroll;
      Object.assign(board.style, { overflowX: 'auto' });
      Object.defineProperties(board, {
        clientWidth: { value: 1147 },
        scrollWidth: { value: 2100 },
        clientHeight: { value: 600 },
        scrollHeight: { value: 600 },
      });
      const scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
        const options =
          typeof optionsOrX === 'number' ? { left: optionsOrX, top: y ?? 0 } : optionsOrX;
        // Match instant native scrolling: layout changes before the scroll event is delivered.
        if (options?.behavior === 'auto') {
          scroller.scrollLeft = Math.max(0, Math.min(953, options.left ?? scroller.scrollLeft));
          setTimeout(() => fireEvent.scroll(scroller), 0);
        }
      });
      scroller.scrollTo = scrollTo;
      scroller.scrollBy = (optionsOrX?: ScrollToOptions | number, y?: number) => {
        const options =
          typeof optionsOrX === 'number' ? { left: optionsOrX, top: y ?? 0 } : optionsOrX;
        scrollTo({ ...options, left: scroller.scrollLeft + (options?.left ?? 0) });
      };
      card.focus();
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      for (const [index, code] of directions.entries()) {
        // Native scroll changes layout before its asynchronous scroll notification.
        if (index === 1) scroller.scrollLeft = Math.max(0, scroller.scrollLeft - 300);
        fireEvent.keyDown(document, { code });
        await waitFor(() =>
          expect(screen.getByRole('status')).toHaveTextContent(
            `TASK-1000 Task가 ${destinations[index]} 열 위에 있습니다.`,
          ),
        );
      }
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      await waitFor(() =>
        expect(updateTaskStatus).toHaveBeenCalledWith(task.id, finalStatus, expect.anything()),
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        `TASK-1000 Task를 ${destinations.at(-1)} 열에 놓았습니다.`,
      );
      expect(screen.getByLabelText(`${destinations.at(-1)} 열`)).toHaveTextContent(task.display_id);
    },
  );
});
