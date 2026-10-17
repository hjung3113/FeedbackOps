import { getTask, listTasks, updateTaskStatus } from '@/lib/api/tasks';
import { ApiError } from '@/lib/api/types';
import type { TaskStatus } from '@fops/shared';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_BOARD_STATUS_COLUMNS, taskBoardColumnKey } from '../hooks/useTaskBoardData';
import { TaskBoardRoute } from './TaskBoardRoute';
import { boardList, listBoardTasks } from './taskBoardTestServer';

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

type BoardTask = Omit<typeof task, 'status'> & { status: TaskStatus };

// Every board list read waits here; one release answers all of them from the given server state.
function holdLists() {
  const waiting: Array<{ options: Record<string, unknown>; resolve: (value: never) => void }> = [];
  vi.mocked(listTasks).mockImplementation(
    (options) =>
      new Promise((resolve) => {
        waiting.push({ options: options as Record<string, unknown>, resolve: resolve as never });
      }),
  );
  return {
    release(tasks: BoardTask[]) {
      for (const read of waiting.splice(0)) {
        read.resolve(listBoardTasks(tasks, read.options) as never);
      }
    },
  };
}

// Writes the board's per-column caches as a later server state would.
function setBoardData(client: QueryClient, tasks: BoardTask[]) {
  for (const status of TASK_BOARD_STATUS_COLUMNS) {
    client.setQueryData(
      taskBoardColumnKey(
        { managedSystem: undefined, q: undefined, publicUpdate: undefined },
        {},
        status,
      ),
      { pages: [listBoardTasks(tasks, { status, limit: 50 })], pageParams: [undefined] },
    );
  }
}

describe('TaskBoardRoute keyboard dragging', () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockImplementation(boardList([task]));
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

  it.each(['click', 'Enter'] as const)(
    'exposes a plain priority-group button and opens detail with %s activation',
    async (activation) => {
      vi.mocked(getTask).mockReturnValue(new Promise(() => {}));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <TaskBoardRoute />
        </QueryClientProvider>,
      );
      const statusCard = await screen.findByRole('button', { name: /TASK-1000:/ });
      expect(statusCard).toHaveAttribute('aria-disabled', 'false');
      expect(statusCard).toHaveAttribute('aria-roledescription', '끌 수 있는 Task');
      expect(statusCard).toHaveAttribute('aria-describedby');
      fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
      fireEvent.click(await screen.findByRole('radio', { name: '우선순위' }));
      const card = await screen.findByRole('button', { name: /TASK-1000:/ });
      expect(card).not.toHaveAttribute('aria-disabled');
      expect(card).not.toHaveAttribute('aria-roledescription');
      expect(card).toHaveAccessibleDescription('상태 그룹화일 때만 드래그로 상태가 변경됩니다.');
      expect(card).toHaveTextContent('상태 그룹화일 때만 드래그로 상태가 변경됩니다.');
      card.focus();
      if (activation === 'Enter') {
        fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
        // jsdom does not synthesize the native button click for Enter.
        card.click();
      } else fireEvent.click(card);
      expect(navigate).toHaveBeenCalledWith({
        to: '/tasks',
        search: { view: 'board', param: task.id },
      });
      expect(await screen.findByLabelText('Task 상세 불러오는 중')).toBeInTheDocument();
      expect(updateTaskStatus).not.toHaveBeenCalled();
    },
  );

  it('releases native arrows when the board unmounts and restores prevention for a fresh keyboard drag', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <button type="button">Outside board</button>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('TASK-1000 Task를 집었습니다.'),
    );
    // A refetch that empties the board removes the DnD subtree mid-drag (a failed background
    // refetch keeps it: the loaded columns stay available).
    vi.mocked(listTasks).mockImplementation(boardList([]));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['tasks'] });
    });
    await waitFor(() => expect(screen.queryByLabelText('Backlog 열')).not.toBeInTheDocument());
    const outside = screen.getByRole('button', { name: 'Outside board' });
    outside.focus();
    const afterTeardown = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(outside, afterTeardown);
    expect(afterTeardown.defaultPrevented).toBe(false);

    vi.mocked(listTasks).mockImplementation(boardList([task]));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['tasks'] });
    });
    const recovered = await screen.findByRole('button', { name: /TASK-1000:/ });
    const afterRecovery = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(outside, afterRecovery);
    expect(afterRecovery.defaultPrevented).toBe(false);
    recovered.focus();
    fireEvent.keyDown(recovered, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('TASK-1000 Task를 집었습니다.'),
    );
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const duringDrag = new KeyboardEvent('keydown', {
        key: code,
        code,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(outside, duringDrag);
      expect(duringDrag.defaultPrevented).toBe(true);
    }
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    const afterCancel = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(outside, afterCancel);
    expect(afterCancel.defaultPrevented).toBe(false);
  });

  it('moves a rendered Task from Backlog to Doing with the keyboard sensor', async () => {
    const liveMessages: string[] = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <React.Profiler
          id="keyboard-announcements"
          onRender={() => {
            const liveRegion = document.querySelector('[role="status"]');
            if (liveRegion) liveMessages.push(liveRegion.textContent ?? '');
          }}
        >
          <TaskBoardRoute />
        </React.Profiler>
      </QueryClientProvider>,
    );

    const backlog = await screen.findByLabelText('Backlog 열');
    const card = within(backlog).getByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await waitFor(() =>
      expect(liveMessages).toContain('TASK-1000 Task를 집었습니다. 현재 열: Backlog.'),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      screen.getByText(task.title, { selector: '[aria-hidden="true"] *' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task를 집었습니다. 현재 열: Backlog.',
      ),
    );

    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task가 Todo 열 위에 있습니다.',
      ),
    );
    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task가 Doing 열 위에 있습니다.',
      ),
    );
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith(
        task.id,
        'doing',
        expect.objectContaining({ ifMatch: task.updated_at, idempotencyKey: expect.any(String) }),
      ),
    );
    expect(screen.getByLabelText('Doing 열')).toHaveTextContent(task.display_id);
    expect(
      within(screen.getByLabelText('Doing 열')).getByRole('button', {
        name: 'TASK-1000: Keyboard draggable Task',
      }),
    ).toHaveFocus();
    expect(
      screen.queryByText(task.title, { selector: '[aria-hidden="true"] *' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task를 Doing 열에 놓았습니다.',
      ),
    );
  });

  it('reaches every column in one press on an overflowing board and prevents native arrows only during drag', async () => {
    const rectSpy = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    const ordinaryRect = rectSpy.getMockImplementation();
    if (!ordinaryRect) throw new Error('Missing board rect fixture');
    let board: HTMLElement | null = null;
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this === board) return boardRect(292, 1147, 600);
      const rect = ordinaryRect.call(this);
      if (this.hasAttribute('data-task-board-column')) {
        return boardRect(292 + rect.left - (board?.scrollLeft ?? 0), rect.width, rect.height);
      }
      if (
        this.getAttribute('aria-label')?.startsWith('TASK-1000:') ||
        (this.getAttribute('aria-hidden') === 'true' && this.textContent?.includes(task.title))
      ) {
        return boardRect(308, 256, 72);
      }
      return rect;
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
      // Smooth scrolling remains pending; instant scrolling updates live column bounds immediately.
      if (options?.behavior === 'auto') {
        scroller.scrollLeft = options.left ?? scroller.scrollLeft;
        fireEvent.scroll(scroller);
      }
    });
    scroller.scrollTo = scrollTo;
    scroller.scrollBy = (optionsOrX?: ScrollToOptions | number, y?: number) => {
      const options =
        typeof optionsOrX === 'number' ? { left: optionsOrX, top: y ?? 0 } : optionsOrX;
      scrollTo({ ...options, left: scroller.scrollLeft + (options?.left ?? 0) });
    };
    const normalArrow = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(card, normalArrow);
    expect(normalArrow.defaultPrevented).toBe(false);
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft']) {
      const arrow = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
      fireEvent(document, arrow);
      expect(arrow.defaultPrevented).toBe(true);
    }
    for (const status of ['Todo', 'Doing', 'Review', 'Done', 'Released', 'Reopened']) {
      const arrow = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      fireEvent(document, arrow);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          `TASK-1000 Task가 ${status} 열 위에 있습니다.`,
        ),
      );
      expect(arrow.defaultPrevented).toBe(true);
    }
    expect(scrollTo).toHaveBeenCalled();
    for (const [options] of scrollTo.mock.calls)
      expect(options).toEqual(expect.objectContaining({ behavior: 'auto' }));
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith(task.id, 'reopened', expect.anything()),
    );
    const afterDrop = new KeyboardEvent('keydown', {
      code: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document, afterDrop);
    expect(afterDrop.defaultPrevented).toBe(false);
  });

  it('walks right one column per press, clamps at the last column, and walks back without skipping', async () => {
    const rectSpy = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    const ordinaryRect = rectSpy.getMockImplementation();
    if (!ordinaryRect) throw new Error('Missing board rect fixture');
    let board: HTMLElement | null = null;
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this === board) return boardRect(292, 1147, 600);
      const rect = ordinaryRect.call(this);
      // Columns overflow the 1147px scroller and move with its scroll offset.
      if (this.hasAttribute('data-task-board-column')) {
        return boardRect(292 + rect.left - (board?.scrollLeft ?? 0), rect.width, rect.height);
      }
      if (
        this.getAttribute('aria-label')?.startsWith('TASK-1000:') ||
        (this.getAttribute('aria-hidden') === 'true' && this.textContent?.includes(task.title))
      ) {
        return boardRect(308, 256, 72);
      }
      return rect;
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
    Object.defineProperties(board, {
      clientWidth: { value: 1147 },
      scrollWidth: { value: 2100 },
      clientHeight: { value: 600 },
      scrollHeight: { value: 600 },
    });
    Object.assign(board.style, { overflowX: 'auto' });
    const scrollTo = (optionsOrX?: ScrollToOptions | number, y?: number) => {
      const options =
        typeof optionsOrX === 'number' ? { left: optionsOrX, top: y ?? 0 } : optionsOrX;
      scroller.scrollLeft = options?.left ?? scroller.scrollLeft;
      fireEvent.scroll(scroller);
    };
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
    const press = async (code: 'ArrowRight' | 'ArrowLeft', expected: string) => {
      fireEvent.keyDown(document, { key: code, code });
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          `TASK-1000 Task가 ${expected} 열 위에 있습니다.`,
        ),
      );
    };
    for (const status of ['Todo', 'Doing', 'Review', 'Done', 'Released', 'Reopened'])
      await press('ArrowRight', status);
    // Past the last column nothing moves: the announcement and the target stay on Reopened.
    for (let extra = 0; extra < 2; extra += 1) {
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
      await act(async () => {
        await Promise.resolve();
      });
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reopened 열 위에'));
    }
    for (const status of ['Released', 'Done', 'Review', 'Doing', 'Todo', 'Backlog'])
      await press('ArrowLeft', status);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  async function keyboardMove(card: HTMLElement, presses: number) {
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (let step = 0; step < presses; step += 1) {
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    }
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
  }
  const columnCount = (status: string) =>
    screen.getByLabelText(`${status} 열`).querySelector('header span:last-child');

  it('moves the card across columns with the keyboard, updates both column totals and keeps it mounted and focused', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    await waitFor(() => expect(columnCount('Backlog')).toHaveTextContent('1'));
    expect(columnCount('Doing')).toHaveTextContent('0');
    await keyboardMove(card, 2);
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    expect(columnCount('Backlog')).toHaveTextContent('0');
    expect(columnCount('Doing')).toHaveTextContent('1');
  });

  it('waits for a destination column that is still loading before moving the card there', async () => {
    let releaseDoing!: () => void;
    const doingGate = new Promise<void>((resolve) => {
      releaseDoing = resolve;
    });
    const list = boardList([task]);
    vi.mocked(listTasks).mockImplementation(async (options) => {
      if (options?.status === 'doing') await doingGate;
      return list(options as Record<string, unknown>);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    expect(columnCount('Doing')).toHaveTextContent('—');
    await keyboardMove(card, 2);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // No PATCH and no card in Doing until the destination can render it.
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Doing 열')).not.toHaveTextContent(task.display_id);
    await act(async () => {
      releaseDoing();
    });
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalled());
    expect(columnCount('Backlog')).toHaveTextContent('0');
  });

  it('does not pull focus when later data returns the card after its move settled', async () => {
    const otherTask = {
      ...task,
      id: '10000000-0000-0000-0000-000000000002',
      display_id: 'TASK-1001',
      title: 'Other Task',
    };
    let server = [task, otherTask];
    vi.mocked(listTasks).mockImplementation(
      async (options) => listBoardTasks(server, options as Record<string, unknown>) as never,
    );
    let resolveUpdate!: (value: unknown) => void;
    vi.mocked(updateTaskStatus).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }) as never,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    await keyboardMove(card, 2);
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    (document.activeElement as HTMLElement).blur();
    // The server settles with the card in no column of this board's reads.
    server = [otherTask];
    await act(async () => {
      resolveUpdate({ ...task, status: 'doing' });
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /TASK-1000:/ })).not.toBeInTheDocument(),
    );
    // A later read that brings the card back in the destination must not pull focus.
    await act(async () => {
      setBoardData(client, [{ ...task, status: 'doing' }, otherTask]);
    });
    await within(screen.getByLabelText('Doing 열')).findByRole('button', { name: /TASK-1000:/ });
    expect(document.body).toHaveFocus();
  });

  it('keeps pickup live until leaving the origin and announces returning to it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'TASK-1000 Task를 집었습니다. 현재 열: Backlog.',
      ),
    );
    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'TASK-1000 Task가 Todo 열 위에 있습니다.',
      ),
    );
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'TASK-1000 Task가 Backlog 열 위에 있습니다.',
      ),
    );
  });

  it('cancels keyboard dragging with Escape, clears the copy, and announces cancellation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const backlog = await screen.findByLabelText('Backlog 열');
    const card = within(backlog).getByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(
      screen.getByText(task.title, { selector: '[aria-hidden="true"] *' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(
      within(backlog).getByRole('button', { name: 'TASK-1000: Keyboard draggable Task' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(task.title, { selector: '[aria-hidden="true"] *' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('TASK-1000 Task 이동을 취소했습니다.'),
    );
    expect(card).toHaveFocus();
  });

  it.each(['body', 'board', 'outside'] as const)(
    'waits for the optimistic destination render and respects focus on %s',
    async (focusLocation) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let releaseCancellation!: () => void;
      const cancellation = new Promise<void>((resolve) => {
        releaseCancellation = resolve;
      });
      vi.spyOn(client, 'cancelQueries').mockReturnValue(cancellation);
      render(
        <QueryClientProvider client={client}>
          <button type="button">Outside board</button>
          <TaskBoardRoute />
        </QueryClientProvider>,
      );
      const card = await screen.findByRole('button', {
        name: 'TASK-1000: Keyboard draggable Task',
      });
      card.focus();
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      for (let step = 0; step < 2; step += 1) {
        fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
      }
      const outside = screen.getByRole('button', { name: 'Outside board' });
      if (focusLocation === 'outside') outside.focus();
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      expect(
        within(screen.getByLabelText('Backlog 열')).getByRole('button', {
          name: 'TASK-1000: Keyboard draggable Task',
        }),
      ).toBe(card);
      expect(screen.getByLabelText('Doing 열')).not.toHaveTextContent(task.display_id);
      expect(updateTaskStatus).not.toHaveBeenCalled();
      if (focusLocation === 'outside') expect(outside).toHaveFocus();
      if (focusLocation === 'body') card.blur();
      await act(async () => {
        releaseCancellation();
      });
      const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
        name: 'TASK-1000: Keyboard draggable Task',
      });
      await waitFor(() => expect(updateTaskStatus).toHaveBeenCalled());
      if (focusLocation === 'outside') expect(outside).toHaveFocus();
      else expect(destination).toHaveFocus();
    },
  );

  it.each(['ordinary rejection', 'rollback committed before rejection', 'outside focus'] as const)(
    'returns focus after a rejected committed move: %s',
    async (order) => {
      let rejectUpdate!: (error: Error) => void;
      let releaseSettled!: () => void;
      const settled = new Promise<void>((resolve) => {
        releaseSettled = resolve;
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
        mutationCache: new MutationCache({
          onSettled: () => (order === 'rollback committed before rejection' ? settled : undefined),
        }),
      });
      vi.mocked(updateTaskStatus).mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectUpdate = reject;
        }),
      );
      render(
        <QueryClientProvider client={client}>
          <button type="button">Outside board</button>
          <TaskBoardRoute />
        </QueryClientProvider>,
      );
      const card = await screen.findByRole('button', { name: /TASK-1000:/ });
      card.focus();
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
        name: /TASK-1000:/,
      });
      await waitFor(() => expect(destination).toHaveFocus());
      const outside = screen.getByRole('button', { name: 'Outside board' });
      if (order === 'outside focus') outside.focus();
      await act(async () => {
        rejectUpdate(new Error('Move rejected'));
      });
      const origin = await within(screen.getByLabelText('Backlog 열')).findByRole('button', {
        name: /TASK-1000:/,
      });
      if (order === 'rollback committed before rejection') {
        expect(client.isMutating()).toBe(1);
        expect(document.body).toHaveFocus();
        await act(async () => {
          releaseSettled();
        });
      }
      await waitFor(() => expect(client.isMutating()).toBe(0));
      if (order === 'outside focus') expect(outside).toHaveFocus();
      else await waitFor(() => expect(origin).toHaveFocus());
    },
  );

  it('follows a rejected Task through rollback and a third-status refetch', async () => {
    let rejectUpdate!: (error: Error) => void;
    vi.mocked(updateTaskStatus).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'Space' });
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    const refetch = holdLists();
    await act(async () => {
      rejectUpdate(new ApiError(409, { code: 'conflict.stale_write', message: 'Stale move' }));
    });
    const rollback = await within(screen.getByLabelText('Backlog 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(rollback).toHaveFocus());
    await act(async () => {
      refetch.release([{ ...task, status: 'review' }]);
    });
    const serverCard = await within(screen.getByLabelText('Review 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(serverCard).toHaveFocus());
    expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0);
  });

  it('retains rejected keyboard recovery until a deferred reconciliation settles', async () => {
    const other = {
      ...task,
      id: '10000000-0000-0000-0000-000000000002',
      display_id: 'TASK-1001',
      title: 'Other Task',
    };
    vi.mocked(listTasks).mockImplementation(boardList([task, other]));
    let releaseOther!: (value: never) => void;
    let rejectTask!: (error: Error) => void;
    vi.mocked(updateTaskStatus)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseOther = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectTask = reject;
        }),
      );
    vi.mocked(getTask).mockResolvedValue({ ...other, source: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute selectedParam={other.id} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '다음 상태로 이동' }));
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledTimes(1));
    const card = screen.getByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'Space' });
    await waitFor(() => expect(updateTaskStatus).toHaveBeenCalledTimes(2));
    const refetch = holdLists();
    await act(async () => {
      rejectTask(new ApiError(409, { code: 'conflict.stale_write', message: 'Stale move' }));
    });
    await waitFor(() => expect(client.isMutating()).toBe(1));
    const rollback = within(screen.getByLabelText('Backlog 열')).getByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(rollback).toHaveFocus());
    expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0);
    await act(async () => {
      releaseOther({ ...other, status: 'todo' } as never);
    });
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBeGreaterThan(0));
    await act(async () => {
      refetch.release([
        { ...task, status: 'review' },
        { ...other, status: 'todo' },
      ]);
    });
    const serverCard = await within(screen.getByLabelText('Review 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(serverCard).toHaveFocus());
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0));
    serverCard.blur();
    act(() =>
      setBoardData(client, [
        { ...task, status: 'doing' },
        { ...other, status: 'todo' },
      ]),
    );
    await within(screen.getByLabelText('Doing 열')).findByRole('button', { name: /TASK-1000:/ });
    expect(document.body).toHaveFocus();
  });

  it('does not redirect focus when a same-Task next-status action supersedes a pending keyboard move', async () => {
    let rejectUpdate!: (error: Error) => void;
    const otherTask = {
      ...task,
      id: '10000000-0000-0000-0000-000000000002',
      display_id: 'TASK-1001',
      title: 'Other Task',
    };
    vi.mocked(listTasks).mockImplementation(boardList([task, otherTask]));
    vi.mocked(getTask).mockResolvedValue({ ...task, source: null });
    vi.mocked(updateTaskStatus).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute selectedParam={task.id} />
      </QueryClientProvider>,
    );
    const next = await screen.findByRole('button', { name: '다음 상태로 이동' });
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'Space' });
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    fireEvent.click(next);
    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith(task.id, 'review', expect.anything()),
    );
    const other = screen.getByRole('button', { name: /TASK-1001:/ });
    other.focus();
    await act(async () => {
      rejectUpdate(new Error('Older move rejected'));
    });
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(other).toHaveFocus();
    await act(async () => {
      setBoardData(client, [task, otherTask]);
    });
    await within(screen.getByLabelText('Backlog 열')).findByRole('button', { name: /TASK-1000:/ });
    expect(other).toHaveFocus();
  });

  it('retires rejection recovery after refetch so later data cannot steal another card focus', async () => {
    let rejectUpdate!: (error: Error) => void;
    const otherTask = {
      ...task,
      id: '10000000-0000-0000-0000-000000000002',
      display_id: 'TASK-1001',
      title: 'Other Task',
    };
    vi.mocked(listTasks).mockImplementation(boardList([task, otherTask]));
    vi.mocked(updateTaskStatus).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );
    let releaseSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      releaseSettled = resolve;
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
      mutationCache: new MutationCache({ onSettled: () => settled }),
    });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', { name: /TASK-1000:/ });
    card.focus();
    fireEvent.keyDown(card, { code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'ArrowRight' });
    fireEvent.keyDown(document, { code: 'Space' });
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: /TASK-1000:/,
    });
    await waitFor(() => expect(destination).toHaveFocus());
    const refetch = holdLists();
    await act(async () => {
      rejectUpdate(new ApiError(409, { code: 'conflict.stale_write', message: 'Stale move' }));
    });
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBeGreaterThan(0));
    const other = screen.getByRole('button', { name: /TASK-1001:/ });
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    await act(async () => {
      refetch.release([{ ...task, status: 'review' }, otherTask]);
    });
    await within(screen.getByLabelText('Review 열')).findByRole('button', { name: /TASK-1000:/ });
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0));
    vi.mocked(listTasks).mockImplementation(boardList([{ ...task, status: 'review' }, otherTask]));
    await act(async () => {
      releaseSettled();
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(client.isFetching({ queryKey: ['tasks'] })).toBe(0));
    expect(outside).toHaveFocus();
    other.focus();
    outside.remove();
    await act(async () => {
      setBoardData(client, [task, otherTask]);
    });
    await within(screen.getByLabelText('Backlog 열')).findByRole('button', { name: /TASK-1000:/ });
    expect(other).toHaveFocus();
  });

  it('abandons destination focus after rejection before the destination commits', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let releaseCancellation!: () => void;
    vi.spyOn(client, 'cancelQueries').mockReturnValue(
      new Promise<void>((resolve) => {
        releaseCancellation = resolve;
      }),
    );
    vi.mocked(updateTaskStatus).mockRejectedValueOnce(new Error('Move rejected'));
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (let step = 0; step < 2; step += 1) {
      fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });
    }
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    expect(screen.getByLabelText('Doing 열')).not.toHaveTextContent(task.display_id);
    expect(updateTaskStatus).not.toHaveBeenCalled();
    await act(async () => {
      releaseCancellation();
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(
      within(screen.getByLabelText('Backlog 열')).getByRole('button', {
        name: 'TASK-1000: Keyboard draggable Task',
      }),
    ).toBe(card);
    card.blur();
    expect(document.body).toHaveFocus();

    vi.mocked(listTasks).mockImplementation(boardList([{ ...task, status: 'doing' }]));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['tasks'] });
    });
    const destination = await within(screen.getByLabelText('Doing 열')).findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    expect(destination).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('preserves a newer keyboard destination request when an older move fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let releaseOlder!: () => void;
    let releaseNewer!: () => void;
    vi.spyOn(client, 'cancelQueries')
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          releaseOlder = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          releaseNewer = resolve;
        }),
      );
    vi.mocked(updateTaskStatus).mockRejectedValueOnce(new Error('Older move rejected'));
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    for (let move = 0; move < 2; move += 1) {
      card.focus();
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      for (let step = 0; step < (move === 0 ? 2 : 1); step += 1) {
        const direction = 'ArrowRight';
        fireEvent.keyDown(document, { key: direction, code: direction });
      }
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(
          move === 0
            ? 'TASK-1000 Task가 Doing 열 위에 있습니다.'
            : 'TASK-1000 Task가 Todo 열 위에 있습니다.',
        ),
      );
      fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(screen.getByLabelText('Doing 열')).not.toHaveTextContent(task.display_id);
    expect(updateTaskStatus).not.toHaveBeenCalled();
    await act(async () => {
      releaseOlder();
    });
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(screen.getByLabelText('Todo 열')).not.toHaveTextContent(task.display_id);
    expect(document.body).toHaveFocus();
    await act(async () => {
      releaseNewer();
    });
    const destination = await within(screen.getByLabelText('Todo 열')).findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    expect(destination).toHaveFocus();
  });

  it('keeps focus on the card after a same-column keyboard drop', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task를 Backlog 열에 놓았습니다.',
      ),
    );
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(card).toHaveFocus();
  });

  it('clamps keyboard movement at the first column', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaskBoardRoute />
      </QueryClientProvider>,
    );
    const card = await screen.findByRole('button', {
      name: 'TASK-1000: Keyboard draggable Task',
    });
    expect(document.getElementById(card.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Task를 집으려면 스페이스나 엔터를 누르세요. 화살표 키로 열을 옮기고, 스페이스나 엔터로 놓거나 Escape로 취소합니다.',
    );
    card.focus();
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task를 집었습니다. 현재 열: Backlog.',
      ),
    );
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'TASK-1000 Task를 Backlog 열에 놓았습니다.',
      ),
    );
    expect(updateTaskStatus).not.toHaveBeenCalled();
    expect(card).toHaveFocus();
  });
});
