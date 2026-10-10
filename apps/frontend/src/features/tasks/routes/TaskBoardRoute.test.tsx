import { ApiError } from '@/lib/api/types';
import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { TasksRouteView, tasksSearchSchema } from '@/routes/_authed/tasks';
import { taskPrioritySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';

const task = {
  id: '10000000-0000-0000-0000-000000000001', workspace_id: '90000000-0000-0000-0000-000000000009', display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003', title: '매출 리포트 쿼리 플랜 개선', status: 'backlog' as const,
  priority: 'high' as const, assignee_actor_id: null, due_date: null, milestone_id: null, analytics_area_id: null, source_task_request_id: null,
  created_by: '20000000-0000-0000-0000-000000000002', created_at: '2026-07-10T00:00:00.000Z', updated_at: '2026-07-10T00:00:00.000Z',
};

const api = vi.hoisted(() => ({ getTask: vi.fn(), listTasks: vi.fn(), updateTaskStatus: vi.fn() }));
const draggableOptions = vi.hoisted(() => [] as Array<{ id?: string; disabled?: boolean }>);
const sensorOptions = vi.hoisted(() => [] as Array<{ Sensor: unknown; options?: unknown }>);
const navigate = vi.hoisted(() => vi.fn());
const overlayProps = vi.hoisted(() => ({ dropAnimation: undefined as unknown, transition: undefined as unknown }));
const scrollProps = vi.hoisted(() => ({
  collisionDetection: undefined as import('@dnd-kit/core').CollisionDetection | undefined,
  autoScroll: undefined as { canScroll?: (element: Element) => boolean } | undefined,
  measuring: undefined as
    | { droppable?: { measure?: (element: HTMLElement) => unknown } }
    | undefined,
}));
const droppableNodes = vi.hoisted(() => new Map<string, HTMLElement>());

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children }: {
    to: string;
    search: { view: string; managedSystem?: string };
    children: React.ReactNode;
  }) => {
    const params = new URLSearchParams({
      view: search.view,
      ...(search.managedSystem !== undefined ? { managedSystem: search.managedSystem } : {}),
    });
    return <a href={`${to}?${params.toString()}`}>{children}</a>;
  },
  useNavigate: () => navigate,
  createFileRoute: () => () => ({ useSearch: () => ({}) }),
}));
vi.mock('@dnd-kit/core', async () => ({
  rectIntersection: (await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core'))
    .rectIntersection,
  getClientRect: (await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core'))
    .getClientRect,
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
    onDragCancel,
    autoScroll,
    measuring,
    collisionDetection,
  }: {
    children: React.ReactNode;
    onDragStart: (event: unknown) => void;
    onDragEnd: (event: unknown) => void;
    onDragCancel: () => void;
    autoScroll?: { canScroll?: (element: Element) => boolean };
    measuring?: { droppable?: { measure?: (element: HTMLElement) => unknown } };
    collisionDetection?: import('@dnd-kit/core').CollisionDetection;
  }) => {
    scrollProps.autoScroll = autoScroll;
    scrollProps.measuring = measuring;
    scrollProps.collisionDetection = collisionDetection;
    const active = { id: task.id, data: { current: { task } } };
    return (
      <>
        <button
          type="button"
          onClick={() =>
            onDragStart({
              active,
              activatorEvent: new MouseEvent('pointerdown', { clientX: 600, clientY: 400 }),
            })
          }
        >
          simulate drag start
        </button>
        {[845, 1140, 1430, 300].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() =>
              document.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: 400 }))
            }
          >
            simulate pointer at {x}
          </button>
        ))}
        {['doing', 'backlog', 'none'].map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onDragEnd({ active, over: target === 'none' ? null : { id: target } })}
          >
            simulate drag to {target}
          </button>
        ))}
        <button type="button" onClick={onDragCancel}>
          simulate drag cancel
        </button>
        {children}
      </>
    );
  },
  DragOverlay: ({
    children,
    dropAnimation,
    transition,
  }: {
    children: React.ReactNode;
    dropAnimation: unknown;
    transition: unknown;
  }) => {
    overlayProps.dropAnimation = dropAnimation;
    overlayProps.transition = transition;
    return <div data-testid="drag-overlay">{children}</div>;
  },
  KeyboardSensor: class {},
  PointerSensor: class {},
  useDraggable: (options: { id?: string; disabled?: boolean }) => {
    draggableOptions.push(options);
    return { setNodeRef: vi.fn(), listeners: {}, attributes: {}, isDragging: false };
  },
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: (node: HTMLElement | null) => {
      if (node) droppableNodes.set(id, node);
    },
    isOver: false,
  }),
  useSensor: (Sensor: unknown, options?: unknown) => {
    sensorOptions.push({ Sensor, options });
    return {};
  },
  useSensors: () => [],
}));
vi.mock('@fops/ui', async () => {
  const actual = await vi.importActual<typeof import('@fops/ui')>('@fops/ui');
  return {
    ...actual,
    WorkbenchShell: ({ toolbar, children, detailPanel }: { toolbar: { title: React.ReactNode; actions: React.ReactNode }; children: React.ReactNode; detailPanel?: React.ReactNode }) => <div><header>{toolbar.title}{toolbar.actions}</header>{children}<aside>{detailPanel}</aside></div>,
  };
});
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: vi.fn(async () => ({ items: [{ id: task.primary_managed_system_id, name: 'Billing Ops', archived_at: null }] })) }));
vi.mock('@/lib/api/tasks', () => api);
vi.mock('./TaskListRoute', async () => {
  const actual = await vi.importActual<typeof import('./TaskListRoute')>('./TaskListRoute');
  return { ...actual, TaskListRoute: () => <div>task list unchanged</div> };
});
vi.mock('./TaskRequestsRoute', () => ({ TaskRequestsRoute: () => <div>task requests unchanged</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

function renderBoard(selectedParam?: string, managedSystem?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route = (
    <TaskBoardRoute
      {...(selectedParam !== undefined ? { selectedParam } : {})}
      {...(managedSystem !== undefined ? { managedSystem } : {})}
    />
  );
  return { client, ...render(<QueryClientProvider client={client}>{route}</QueryClientProvider>) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('TaskBoardRoute', () => {
  beforeEach(() => {
    api.getTask.mockReset();
    api.listTasks.mockReset();
    api.updateTaskStatus.mockReset();
    draggableOptions.length = 0;
    sensorOptions.length = 0;
    navigate.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.warning).mockReset();
  });

  afterEach(() => {
    for (const token of ['duration-slow', 'duration-fast', 'ease-enter', 'ease-standard']) {
      document.documentElement.style.removeProperty(`--motion-${token}`);
    }
    vi.unstubAllGlobals();
  });

  it.each([
    ['doing', false, false],
    ['backlog', false, false],
    ['none', false, false],
    ['doing', true, false],
    ['doing', false, true],
    ['backlog', false, true],
    ['none', false, true],
    ['doing', true, true],
  ] as const)(
    'uses per-drop motion for target %s, non-status %s, reduced motion %s',
    async (target, nonStatus, reduced) => {
      document.documentElement.style.setProperty('--motion-duration-slow', '0.321s');
      document.documentElement.style.setProperty('--motion-duration-fast', '123ms');
      document.documentElement.style.setProperty('--motion-ease-enter', 'ease-in');
      document.documentElement.style.setProperty('--motion-ease-standard', 'ease-out');
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reduced })),
      );
      api.listTasks.mockResolvedValue({ items: [task] });
      api.updateTaskStatus.mockImplementation(() => new Promise(() => {}));
      renderBoard();
      await screen.findByText('TASK-1000');
      if (nonStatus) {
        fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
        fireEvent.click(await screen.findByRole('radio', { name: '우선순위' }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'simulate drag start' }));
      const overlay = screen.getByTestId('drag-overlay');
      expect(overlay).toHaveTextContent(task.title);
      expect(overlay.firstElementChild).toHaveAttribute('aria-hidden', 'true');
      expect(overlay.querySelector('button, [tabindex]')).toBeNull();
      expect(overlayProps.transition).toBe(reduced ? null : 'transform 123ms ease-out');
      fireEvent.click(screen.getByRole('button', { name: `simulate drag to ${target}` }));
      const moves = target === 'doing' && !nonStatus;
      expect(overlayProps.dropAnimation).toEqual(
        moves || reduced ? null : { duration: 321, easing: 'ease-in' },
      );
      expect(overlay).toBeEmptyDOMElement();
      await act(async () => {
        await Promise.resolve();
      });
      if (moves) {
        await waitFor(() =>
          expect(api.updateTaskStatus).toHaveBeenCalledWith(task.id, 'doing', expect.any(Object)),
        );
      } else {
        expect(api.updateTaskStatus).not.toHaveBeenCalled();
      }
    },
  );

  it('clears the presentation copy on drag cancel without a PATCH', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag start' }));
    expect(screen.getByTestId('drag-overlay')).toHaveTextContent(task.title);
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag cancel' }));
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('allows board auto-scroll only at its own edges and keeps column scrolling eligible', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    const column = await screen.findByLabelText('Backlog 열');
    const board = column.parentElement as HTMLElement;
    const columnScroller = column.querySelector('.overflow-y-auto') as HTMLElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(292, 100, 1147, 700));
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag start' }));
    expect(scrollProps.autoScroll?.canScroll).toEqual(expect.any(Function));
    for (const [x, eligible] of [
      [845, false],
      [1140, false],
      [1430, true],
      [300, true],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `simulate pointer at ${x}` }));
      expect(scrollProps.autoScroll?.canScroll?.(board)).toBe(eligible);
      expect(scrollProps.autoScroll?.canScroll?.(columnScroller)).toBe(true);
    }
  });

  it('keeps the hovered column scroller in dnd-kit ancestors with full-column drop bounds', async () => {
    const { getScrollableAncestors } =
      await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    const column = await screen.findByLabelText('Backlog 열');
    const board = column.parentElement as HTMLElement;
    const columnScroller = column.querySelector('.overflow-y-auto') as HTMLElement;
    columnScroller.style.overflowY = 'auto';
    board.style.overflowX = 'auto';
    const dropNode = droppableNodes.get('backlog') as HTMLElement;
    expect(getScrollableAncestors(dropNode)).toEqual([columnScroller, board]);
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(new DOMRect(292, 100, 288, 700));
    expect(scrollProps.measuring?.droppable?.measure?.(dropNode)).toMatchObject({
      left: 292,
      top: 100,
      width: 288,
      height: 700,
    });
    // Even after the inner ref scrolls, the column header remains a valid drop target.
    const collisions = scrollProps.collisionDetection?.({
      active: {
        id: task.id,
        data: { current: { task } },
        rect: { current: { initial: null, translated: null } },
      },
      pointerCoordinates: null,
      collisionRect: new DOMRect(300, 110, 256, 72),
      droppableRects: new Map([['backlog', new DOMRect(292, -800, 288, 700)]]),
      droppableContainers: [
        {
          id: 'backlog',
          key: 'backlog',
          disabled: false,
          node: { current: dropNode },
          rect: { current: null },
          data: { current: {} },
        },
      ],
    });
    expect(collisions?.map(({ id }) => id)).toEqual(['backlog']);
  });

  it.each(['doing', 'backlog'] as const)(
    'refreshes cancel motion after a previous %s drop in the same route',
    async (target) => {
      document.documentElement.style.setProperty('--motion-duration-slow', '321ms');
      document.documentElement.style.setProperty('--motion-ease-enter', 'ease-in');
      let reduced = false;
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reduced })),
      );
      api.listTasks.mockResolvedValue({ items: [task] });
      api.updateTaskStatus.mockImplementation(() => new Promise(() => {}));
      renderBoard();
      await screen.findByText('TASK-1000');
      fireEvent.click(screen.getByRole('button', { name: 'simulate drag start' }));
      fireEvent.click(screen.getByRole('button', { name: `simulate drag to ${target}` }));
      if (target === 'doing') {
        await waitFor(() => expect(api.updateTaskStatus).toHaveBeenCalled());
      } else {
        reduced = true;
      }
      const requestsBeforeCancel = api.updateTaskStatus.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'simulate drag start' }));
      fireEvent.click(screen.getByRole('button', { name: 'simulate drag cancel' }));
      expect(overlayProps.dropAnimation).toEqual(
        reduced ? null : { duration: 321, easing: 'ease-in' },
      );
      expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement();
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.updateTaskStatus.mock.calls.length).toBe(requestsBeforeCancel);
    },
  );

  it('renders all seven status columns and an empty placeholder', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    await screen.findByText('TASK-1000');
    for (const status of ['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened']) {
      expect(screen.getByLabelText(`${status[0]!.toUpperCase()}${status.slice(1)} 열`)).toBeInTheDocument();
    }
    expect(screen.getAllByText('비어있음').length).toBe(6);
    expect(screen.getByText('Task는 Task Request에서 전환됩니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Task Request 검토' })).toHaveAttribute(
      'href',
      '/tasks?view=requests',
    );
    expect(screen.queryByRole('button', { name: 'Task 생성' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Task 추가/ })).not.toBeInTheDocument();
  });

  it('shows the conversion guidance in the empty board and preserves Managed System in its link', async () => {
    const managedSystem = 'all';
    api.listTasks.mockResolvedValue({ items: [] });
    renderBoard(undefined, managedSystem);

    const emptyBoard = await screen.findByRole('status');
    expect(emptyBoard).toHaveTextContent('Task는 Task Request에서 전환됩니다.');
    const links = screen.getAllByRole('link', { name: 'Task Request 검토' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/tasks?view=requests&managedSystem=all');
    }
    expect(screen.getByText('0건')).toBeInTheDocument();
    expect(screen.queryByText('비어있음')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Task 생성' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Task 추가/ })).not.toBeInTheDocument();
  });

  it('renders localized task count labels in board stats', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();

    await screen.findByText('TASK-1000');
    expect(screen.getByText('전체 Task')).toBeInTheDocument();
    const card = screen.getByRole('button', { name: 'TASK-1000: 매출 리포트 쿼리 플랜 개선' });
    expect(within(card).getByText('담당자 없음')).toHaveClass(
      'bg-accent-danger/10',
      'text-accent-danger',
    );
    expect(screen.getAllByText('미배정').length).toBeGreaterThan(0);
    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.queryByText('Total tasks')).not.toBeInTheDocument();
    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
  });

  it.each(taskPrioritySchema.options)(
    'shows a display label for priority %s in filters',
    async (priority) => {
      api.listTasks.mockResolvedValue({ items: [task] });
      renderBoard();
      await screen.findByText('TASK-1000');
      fireEvent.click(screen.getByRole('button', { name: '필터' }));

      expect(screen.getByText('우선순위')).toBeInTheDocument();
      expect(screen.getAllByText(TASK_PRIORITY_LABELS[priority]).length).toBeGreaterThan(0);
      expect(screen.queryByText(priority, { exact: true })).not.toBeInTheDocument();
    },
  );

  it.each(taskPrioritySchema.options)(
    'renders priority %s with its Task label on the board card',
    async (priority) => {
      api.listTasks.mockResolvedValue({ items: [{ ...task, priority }] });
      renderBoard();

      const card = await screen.findByRole('button', {
        name: `${task.display_id}: ${task.title}`,
      });
      expect(card).toHaveTextContent(TASK_PRIORITY_LABELS[priority]);
      expect(card).not.toHaveTextContent(priority);
    },
  );

  it('renders permission denied instead of the board unavailable copy for a 403', async () => {
    api.listTasks.mockRejectedValue(new ApiError(403, { code: 'permission.denied', message: 'finding.manage capability required' }));
    renderBoard();

    const panel = await screen.findByText('Task board');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(
      screen.getByText(
        'Task 목록을 볼 권한이 없습니다. 워크스페이스 관리자에게 권한을 요청하세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('finding.manage capability required')).not.toBeInTheDocument();
    expect(
      screen.queryByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).not.toBeInTheDocument();
  });

  it('keeps a non-permission board failure unavailable', async () => {
    api.listTasks.mockRejectedValue(new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }));
    renderBoard();

    expect(
      await screen.findByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });

  it('announces a failed task read, hides its unknown count, and retries into the known count', async () => {
    const firstRead = deferred<{ items: typeof task[] }>();
    api.listTasks.mockReturnValueOnce(firstRead.promise).mockResolvedValueOnce({ items: [task] });
    renderBoard();

    const loading = await screen.findByText('Task 불러오는 중...');
    const liveRegion = loading.closest('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(screen.queryByText('0건')).not.toBeInTheDocument();

    await act(async () => {
      firstRead.reject(
        new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      );
      await firstRead.promise.catch(() => undefined);
    });

    expect(
      await screen.findByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    const error = screen.getByText('Task 보드를 불러오지 못했습니다.');
    expect(error.closest('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toContainElement(error);
    expect(screen.queryByText('0건')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그룹화' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Task Request 검토' })).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(liveRegion).toContainElement(retry);
    fireEvent.click(retry);

    expect(
      await screen.findByRole('button', { name: `${task.display_id}: ${task.title}` }),
    ).toBeInTheDocument();
    expect(screen.getByText('1건')).toBeInTheDocument();
    expect(screen.queryByText('0건')).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it('closes group options with Escape and returns focus to the trigger', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();

    const trigger = await screen.findByRole('button', { name: '그룹화' });
    trigger.focus();
    fireEvent.click(trigger);
    const option = await screen.findByRole('radio', { name: '우선순위' });

    fireEvent.keyDown(option, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('radio', { name: '우선순위' })).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('keeps a pointer click on a status-board card available for selection', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    api.getTask.mockResolvedValue({ ...task, source: null });
    renderBoard();
    const card = await screen.findByRole('button', { name: `${task.display_id}: ${task.title}` });

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(card);

    expect(sensorOptions).toContainEqual({
      Sensor: expect.anything(),
      options: { activationConstraint: { distance: 5 } },
    });
    await screen.findByText('단독 Task');
    expect(navigate).toHaveBeenCalledWith({ to: '/tasks', search: { view: 'board', param: task.id } });
  });

  it('moves a card optimistically and sends concurrency and idempotency arguments', async () => {
    const update = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValue(update.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(api.updateTaskStatus).toHaveBeenCalledWith(task.id, 'doing', expect.objectContaining({ ifMatch: task.updated_at, idempotencyKey: expect.any(String) })));
    expect(screen.getByLabelText('Doing 열')).toHaveTextContent('TASK-1000');
  });

  it('rolls back a failed mutation', async () => {
    const update = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValue(update.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing 열')).toHaveTextContent('TASK-1000'));
    update.reject(new Error('update failed'));
    await waitFor(() => expect(screen.getByLabelText('Backlog 열')).toHaveTextContent('TASK-1000'));
  });

  it('does not allow an older failed mutation to clobber a newer optimistic move', async () => {
    const first = deferred<never>();
    const second = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing 열')).toHaveTextContent('TASK-1000'));
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    first.reject(new Error('first failed'));
    await waitFor(() => expect(screen.getByLabelText('Doing 열')).toHaveTextContent('TASK-1000'));
  });

  it('rolls back and refetches after a stale-write conflict', async () => {
    const update = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValue(update.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing 열')).toHaveTextContent('TASK-1000'));
    update.reject(new ApiError(409, { code: 'conflict.stale_write', message: 'stale' }));
    await waitFor(() => expect(screen.getByLabelText('Backlog 열')).toHaveTextContent('TASK-1000'));
    await waitFor(() => expect(api.listTasks.mock.calls.length).toBeGreaterThan(1));
    expect(toast.error).toHaveBeenCalledWith(
      '다른 사용자가 먼저 변경했습니다. 최신 내용을 불러올까요?',
    );
  });

  it('filters rendered board items for public_update=missing and still drags only when grouped by status', async () => {
    const gap = { ...task, id: '10000000-0000-0000-0000-000000000002', display_id: 'TASK-1001', title: 'Missing public update', status: 'released' as const };
    const updated = { ...task, id: '10000000-0000-0000-0000-000000000003', display_id: 'TASK-1002', title: 'Has public update', status: 'released' as const };
    expect(tasksSearchSchema.parse({ view: 'board', public_update: 'missing', managedSystem: 'all', param: task.id })).toEqual({
      view: 'board', public_update: 'missing', managedSystem: 'all', param: task.id,
    });
    api.listTasks.mockImplementation(async (options?: { public_update?: string }) => options?.public_update === 'missing' ? { items: [gap] } : { items: [task, gap, updated] });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TasksRouteView search={{ view: 'board', public_update: 'missing' }} /></QueryClientProvider>);
    await screen.findByText('TASK-1001');
    expect(screen.queryByText('TASK-1000')).not.toBeInTheDocument();
    expect(screen.queryByText('TASK-1002')).not.toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ public_update: 'missing' }));
    expect(draggableOptions).toContainEqual(expect.objectContaining({ id: gap.id, disabled: false }));
    draggableOptions.length = 0;
    fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
    fireEvent.click(screen.getByRole('radio', { name: '우선순위' }));
    await waitFor(() => expect(draggableOptions).toContainEqual(expect.objectContaining({ id: gap.id, disabled: true })));

    cleanup();
    draggableOptions.length = 0;
    api.listTasks.mockClear();
    renderBoard();
    await screen.findByText('TASK-1000');
    expect(screen.getByText('TASK-1001')).toBeInTheDocument();
    expect(screen.getByText('TASK-1002')).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalled();
    expect(api.listTasks.mock.calls.some((call) => call[0]?.public_update === 'missing')).toBe(false);
  });

  it('disables status drag outside status grouping and uses the toast backstop', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    await screen.findByText('TASK-1000');
    expect(draggableOptions).toContainEqual(expect.objectContaining({ id: task.id, disabled: false }));
    draggableOptions.length = 0;
    fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
    fireEvent.click(screen.getByRole('radio', { name: '우선순위' }));
    await waitFor(() => expect(screen.getByLabelText('높음 열')).toBeInTheDocument());
    await waitFor(() => expect(draggableOptions).toContainEqual(expect.objectContaining({ id: task.id, disabled: true })));
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    expect(api.updateTaskStatus).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('상태로 그룹화한 경우에만 드래그로 상태를 변경할 수 있습니다.');
  });

  it('restores the board selected detail from the URL parameter', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    api.getTask.mockResolvedValue({ ...task, source: null });
    renderBoard(task.id);
    await waitFor(() => expect(screen.getByText(task.title)).toBeInTheDocument());
  });

  it('shows task detail skeleton chrome while the detail query is pending', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    api.getTask.mockReturnValue(new Promise(() => {}));
    renderBoard(task.id);

    const skeleton = await screen.findByLabelText('Task 상세 불러오는 중');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '패널 닫기' })).toBeInTheDocument();
    const placeholders = skeleton.querySelectorAll(
      '[aria-live="polite"] > [aria-hidden="true"]',
    );
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]?.children).toHaveLength(5);
  });

  it('does not reserve an action footer for a released task skeleton', async () => {
    const releasedTask = { ...task, status: 'released' as const };
    api.listTasks.mockResolvedValue({ items: [releasedTask] });
    api.getTask.mockReturnValue(new Promise(() => {}));
    renderBoard(task.id);

    const skeleton = await screen.findByLabelText('Task 상세 불러오는 중');
    const placeholders = skeleton.querySelectorAll(
      '[aria-live="polite"] > [aria-hidden="true"]',
    );
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.children).toHaveLength(5);
  });

  it('shows task detail read errors with a retry that refetches the task', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    api.getTask.mockRejectedValue(new Error('detail failed'));
    renderBoard();

    fireEvent.click(
      await screen.findByRole('button', { name: `${task.display_id}: ${task.title}` }),
    );
    const error = await screen.findByText('Task 상세를 불러오지 못했습니다.');
    expect(error.closest('[aria-live="polite"]')).toContainElement(error);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(2));
  });

  it('refreshes the selected detail after moving a task from done to released', async () => {
    const doneTask = { ...task, status: 'done' as const };
    const releasedTask = { ...doneTask, status: 'released' as const };
    api.listTasks.mockResolvedValue({ items: [doneTask] });
    api.getTask.mockResolvedValueOnce({ ...doneTask, source: null }).mockResolvedValueOnce({ ...releasedTask, source: null });
    api.updateTaskStatus.mockResolvedValue(releasedTask);

    renderBoard(doneTask.id);
    const footerAction = await screen.findByRole('button', { name: '다음 상태로 이동' });
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);

    fireEvent.click(footerAction);

    await waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: '다음 상태로 이동' })).not.toBeInTheDocument());
    expect(screen.getAllByText('Released').length).toBeGreaterThan(0);
  });

  // #290: ADR-0030 allows every status to reach every other status, but the
  // board excluded backlog from the next-status button, leaving drag as the
  // only way out — and drag is closed to keyboard users. Two defects, not one:
  // the render guard hid the button, and the nextStatus map had no backlog
  // entry, so removing the guard alone would render a button that does nothing.
  it('#290 moves a backlog task to todo through the next-status button', async () => {
    const backlogTask = { ...task, status: 'backlog' as const };
    const todoTask = { ...backlogTask, status: 'todo' as const };
    api.listTasks.mockResolvedValue({ items: [backlogTask] });
    api.getTask.mockResolvedValueOnce({ ...backlogTask, source: null }).mockResolvedValueOnce({ ...todoTask, source: null });
    api.updateTaskStatus.mockResolvedValue(todoTask);

    renderBoard(backlogTask.id);
    const footerAction = await screen.findByRole('button', { name: '다음 상태로 이동' });

    fireEvent.click(footerAction);

    await waitFor(() => expect(api.updateTaskStatus).toHaveBeenCalledTimes(1));
    expect(api.updateTaskStatus.mock.calls[0]?.[0]).toBe(backlogTask.id);
    expect(api.updateTaskStatus.mock.calls[0]?.[1]).toBe('todo');
    await waitFor(() => expect(screen.getAllByText('Todo').length).toBeGreaterThan(0));
  });

  it.each(['backlog', 'my', 'inbox'] as const)('keeps the %s view on TaskListRoute', (view) => {
    render(<TasksRouteView search={{ view }} />);
    expect(screen.getByText('task list unchanged')).toBeInTheDocument();
  });

  it('keeps the requests view on TaskRequestsRoute', () => {
    render(<TasksRouteView search={{ view: 'requests' }} />);
    expect(screen.getByText('task requests unchanged')).toBeInTheDocument();
  });
});
