import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';
import { TasksRouteView } from '@/routes/_authed/tasks';
import { ApiError } from '@/lib/api/types';
import { toast } from 'sonner';

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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  createFileRoute: () => () => ({ useSearch: () => ({}) }),
}));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (event: unknown) => void }) => <><button type="button" onClick={() => onDragEnd({ active: { data: { current: { task } } }, over: { id: 'doing' } })}>simulate drag to doing</button>{children}</>,
  KeyboardSensor: class {},
  PointerSensor: class {},
  useDraggable: (options: { id?: string; disabled?: boolean }) => {
    draggableOptions.push(options);
    return { setNodeRef: vi.fn(), listeners: {}, attributes: {}, isDragging: false };
  },
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
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
vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: vi.fn(async () => ({ items: [{ id: task.primary_managed_system_id, name: 'Billing Ops', archived_at: null }] })) }));
vi.mock('@/lib/api/tasks', () => api);
vi.mock('./TaskListRoute', async () => {
  const actual = await vi.importActual<typeof import('./TaskListRoute')>('./TaskListRoute');
  return { ...actual, TaskListRoute: () => <div>task list unchanged</div> };
});
vi.mock('./TaskRequestsRoute', () => ({ TaskRequestsRoute: () => <div>task requests unchanged</div> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

function renderBoard(selectedParam?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route = <TaskBoardRoute {...(selectedParam !== undefined ? { selectedParam } : {})} />;
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

  it('renders all seven status columns and an empty placeholder', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    await screen.findByText('TASK-1000');
    for (const status of ['backlog', 'todo', 'doing', 'review', 'done', 'released', 'reopened']) {
      expect(screen.getByLabelText(`${status[0]!.toUpperCase()}${status.slice(1)} column`)).toBeInTheDocument();
    }
    expect(screen.getAllByText('비어있음').length).toBe(6);
  });

  it('renders permission denied instead of the board unavailable copy for a 403', async () => {
    api.listTasks.mockRejectedValue(new ApiError(403, { code: 'permission.denied', message: 'finding.manage capability required' }));
    renderBoard();

    const panel = await screen.findByText('Task board');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.queryByText('Task board unavailable.')).not.toBeInTheDocument();
  });

  it('keeps a non-permission board failure unavailable', async () => {
    api.listTasks.mockRejectedValue(new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }));
    renderBoard();

    expect(await screen.findByText('Task board unavailable.')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
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
    await screen.findByText('Standalone task');
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
    expect(screen.getByLabelText('Doing column')).toHaveTextContent('TASK-1000');
  });

  it('rolls back a failed mutation', async () => {
    const update = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValue(update.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing column')).toHaveTextContent('TASK-1000'));
    update.reject(new Error('update failed'));
    await waitFor(() => expect(screen.getByLabelText('Backlog column')).toHaveTextContent('TASK-1000'));
  });

  it('does not allow an older failed mutation to clobber a newer optimistic move', async () => {
    const first = deferred<never>();
    const second = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing column')).toHaveTextContent('TASK-1000'));
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    first.reject(new Error('first failed'));
    await waitFor(() => expect(screen.getByLabelText('Doing column')).toHaveTextContent('TASK-1000'));
  });

  it('rolls back and refetches after a stale-write conflict', async () => {
    const update = deferred<never>();
    api.listTasks.mockResolvedValue({ items: [task] });
    api.updateTaskStatus.mockReturnValue(update.promise);
    renderBoard();
    await screen.findByText('TASK-1000');
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    await waitFor(() => expect(screen.getByLabelText('Doing column')).toHaveTextContent('TASK-1000'));
    update.reject(new ApiError(409, { code: 'conflict.stale_write', message: 'stale' }));
    await waitFor(() => expect(screen.getByLabelText('Backlog column')).toHaveTextContent('TASK-1000'));
    await waitFor(() => expect(api.listTasks.mock.calls.length).toBeGreaterThan(1));
    expect(toast.error).toHaveBeenCalledWith('Task changed elsewhere. Board refreshed.');
  });

  it('disables status drag outside status grouping and uses the toast backstop', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    renderBoard();
    await screen.findByText('TASK-1000');
    expect(draggableOptions).toContainEqual(expect.objectContaining({ id: task.id, disabled: false }));
    draggableOptions.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Priority' }));
    await waitFor(() => expect(screen.getByLabelText('High column')).toBeInTheDocument());
    await waitFor(() => expect(draggableOptions).toContainEqual(expect.objectContaining({ id: task.id, disabled: true })));
    fireEvent.click(screen.getByRole('button', { name: 'simulate drag to doing' }));
    expect(api.updateTaskStatus).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith('Group by Status 일 때만 드래그로 상태를 변경할 수 있습니다.');
  });

  it('restores the board selected detail from the URL parameter', async () => {
    api.listTasks.mockResolvedValue({ items: [task] });
    api.getTask.mockResolvedValue({ ...task, source: null });
    renderBoard(task.id);
    await waitFor(() => expect(screen.getByText(task.title)).toBeInTheDocument());
  });

  it('refreshes the selected detail after moving a task from done to released', async () => {
    const doneTask = { ...task, status: 'done' as const };
    const releasedTask = { ...doneTask, status: 'released' as const };
    api.listTasks.mockResolvedValue({ items: [doneTask] });
    api.getTask.mockResolvedValueOnce({ ...doneTask, source: null }).mockResolvedValueOnce({ ...releasedTask, source: null });
    api.updateTaskStatus.mockResolvedValue(releasedTask);

    renderBoard(doneTask.id);
    const footerAction = await screen.findByRole('button', { name: 'Move to next status' });
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);

    fireEvent.click(footerAction);

    await waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move to next status' })).not.toBeInTheDocument());
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
    const footerAction = await screen.findByRole('button', { name: 'Move to next status' });

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
