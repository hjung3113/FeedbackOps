import { TASK_LINK_MISSING_MESSAGE } from '@/lib/copy/tasks';
import type { ListTasksQuery, TaskDto, TaskStatus } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardRoute } from './TaskBoardRoute';
import { listBoardTasks, parseBoardQuery } from './taskBoardTestServer';

// #1178: the board loads one bounded page per status column, groups the open set for the other
// groupings, keeps operational totals in a three-request strip, and resolves unloaded deep links.

const MS = '30000000-0000-0000-0000-000000000003';
const OTHER_MS = '30000000-0000-0000-0000-000000000004';
const ACTOR = '20000000-0000-0000-0000-000000000002';
const STATUSES: TaskStatus[] = [
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
  'released',
  'reopened',
];

const navigate = vi.hoisted(() => vi.fn());
const dnd = vi.hoisted(() => ({
  onDragStart: null as null | ((event: unknown) => void),
  onDragEnd: null as null | ((event: unknown) => void),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
}));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragStart: (event: unknown) => void;
    onDragEnd: (event: unknown) => void;
  }) => {
    dnd.onDragStart = onDragStart;
    dnd.onDragEnd = onDragEnd;
    return <>{children}</>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  KeyboardSensor: class {},
  PointerSensor: class {},
  useDraggable: () => ({ setNodeRef: vi.fn(), listeners: {}, attributes: {}, isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useSensor: () => ({}),
  useSensors: () => [],
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
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [{ id: ACTOR, display_name: '김담당' }] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: vi.fn(async () => ({
    items: [
      { id: MS, name: 'Billing Ops', archived_at: null },
      { id: OTHER_MS, name: 'Other Ops', archived_at: null },
    ],
  })),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

const MILESTONE_ID = '50000000-0000-0000-0000-000000000001';
const MILESTONES = [
  {
    id: MILESTONE_ID,
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'MLS-1',
    primary_managed_system_id: MS,
    title: 'Launch',
    why: 'why',
    status: 'planning',
    owner_actor_id: ACTOR,
    analytics_area_id: null,
    start_date: '2026-10-01',
    target_date: '2026-12-31',
    created_by: ACTOR,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  },
];

let seq = 0;
function makeTask(status: TaskStatus, over: Partial<TaskDto> = {}): TaskDto {
  seq += 1;
  const id = `10000000-0000-0000-0000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: `TASK-${seq}`,
    primary_managed_system_id: MS,
    title: `Task ${seq}`,
    status,
    priority: 'high',
    assignee_actor_id: null,
    assignee_team_id: null,
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: ACTOR,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...over,
  };
}
const many = (status: TaskStatus, count: number, over: Partial<TaskDto> = {}) =>
  Array.from({ length: count }, () => makeTask(status, over));

type Server = ReturnType<typeof startServer>;
function startServer(initial: TaskDto[]) {
  const tasks = [...initial];
  const lists: ListTasksQuery[] = [];
  const patches: Array<{ id: string; body: unknown }> = [];
  const detailReads: string[] = [];
  const holds = {
    lists: false,
    patch: new Map<string, { gate: Promise<void>; fail: boolean }>(),
    release: new Map<string, (fail: boolean) => void>(),
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/tasks') {
        const query = parseBoardQuery(Object.fromEntries(url.searchParams));
        lists.push(query);
        const body = listBoardTasks(tasks, Object.fromEntries(url.searchParams));
        if (holds.lists) await new Promise(() => {});
        return json(body);
      }
      const detail = /^\/tasks\/([^/]+)$/.exec(url.pathname);
      if (detail) {
        const id = detail[1] as string;
        const found = tasks.find((task) => task.id === id);
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body));
          patches.push({ id, body });
          const hold = holds.patch.get(id);
          if (hold) {
            await hold.gate;
            if (hold.fail) return json({ code: 'internal.unexpected', message: 'failed' }, 500);
          }
          if (found) found.status = body.status;
          return json({ ...found, source: null });
        }
        detailReads.push(id);
        return found
          ? json({ ...found, source: null })
          : json({ code: 'not_found.record', message: 'missing' }, 404);
      }
      if (url.pathname === '/milestones') return json({ items: MILESTONES });
      return json({ code: 'not_found.record', message: 'unstubbed' }, 404);
    }),
  );
  return {
    tasks,
    lists,
    patches,
    detailReads,
    holds,
    boardLists: () => lists.filter((q) => q.limit !== 1),
    hold(id: string) {
      let release!: (fail: boolean) => void;
      const entry = { fail: false, gate: Promise.resolve() };
      entry.gate = new Promise<void>((resolve) => {
        release = (fail) => {
          entry.fail = fail;
          resolve();
        };
      });
      holds.patch.set(id, entry);
      holds.release.set(id, release);
    },
  };
}

function mount(props: React.ComponentProps<typeof TaskBoardRoute> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (next: React.ComponentProps<typeof TaskBoardRoute>) => (
    <QueryClientProvider client={client}>
      <TaskBoardRoute {...next} />
    </QueryClientProvider>
  );
  const utils = render(view(props));
  return { client, ...utils, rerenderBoard: (next: typeof props) => utils.rerender(view(next)) };
}

const column = (status: string) =>
  screen.getByLabelText(`${status[0]?.toUpperCase()}${status.slice(1)} 열`);
const headerCount = (status: string) => column(status).querySelector('header span:last-child');
const stat = (label: string) => screen.getByText(label).nextElementSibling;
const cardsIn = (status: string) =>
  within(column(status)).queryAllByRole('button', { name: /^TASK-\d+:/ });

async function drag(task: TaskDto, over: string) {
  const active = { id: task.id, data: { current: { task } } };
  await act(async () => {
    dnd.onDragStart?.({ active, activatorEvent: new MouseEvent('pointerdown') });
    dnd.onDragEnd?.({ active, over: { id: over }, activatorEvent: new MouseEvent('pointerup') });
    await Promise.resolve();
  });
}

describe('bounded Task board (#1178)', () => {
  let server: Server;
  let backlog: TaskDto[];
  let done: TaskDto[];
  beforeEach(() => {
    seq = 0;
    navigate.mockReset();
    backlog = [
      ...many('backlog', 10, { priority: 'low' }),
      ...many('backlog', 50, { priority: 'high' }),
    ];
    done = many('done', 120);
    server = startServer([
      ...backlog,
      ...many('todo', 2),
      makeTask('doing', { assignee_actor_id: ACTOR }),
      ...done,
      ...many('released', 3),
      makeTask('reopened'),
    ]);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sends one bounded request per status column and shows each column total in its header', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(headerCount('done')).toHaveTextContent('120'));
    const board = server.boardLists();
    expect(board.map((query) => query.status).sort()).toEqual([...STATUSES].sort());
    for (const query of board) {
      expect(query.limit).toBe(50);
      expect(query.cursor).toBeUndefined();
    }
    expect(headerCount('backlog')).toHaveTextContent('60');
    expect(cardsIn('backlog')).toHaveLength(50);
    expect(cardsIn('done')).toHaveLength(50);
    expect(headerCount('review')).toHaveTextContent('0');
  });

  it('loads the next page of one column with only that column cursor', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(cardsIn('backlog')).toHaveLength(50));
    const before = server.lists.length;
    fireEvent.click(within(column('backlog')).getByRole('button', { name: '더 불러오기' }));
    await waitFor(() => expect(cardsIn('backlog')).toHaveLength(60));
    const added = server.lists.slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ status: 'backlog', limit: 50, cursor: '50' });
    expect(headerCount('backlog')).toHaveTextContent('60');
  });

  it('shows summary strip totals from three limit=1 requests and a title badge equal to the column totals', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(stat('전체 Task')).toHaveTextContent('187'));
    expect(stat('미배정')).toHaveTextContent('186');
    expect(stat('진행 중')).toHaveTextContent('1');
    const summaries = server.lists.filter((query) => query.limit === 1);
    expect(summaries.map((q) => [q.status, q.assignee])).toEqual(
      expect.arrayContaining([
        [undefined, undefined],
        [undefined, 'unassigned'],
        ['doing', undefined],
      ]),
    );
    expect(summaries).toHaveLength(3);
    expect(screen.getByText('187건')).toBeInTheDocument();
  });

  it('sends a personal filter to every board request, resets cursors, and leaves the strip alone', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(cardsIn('backlog')).toHaveLength(50));
    fireEvent.click(within(column('backlog')).getByRole('button', { name: '더 불러오기' }));
    await waitFor(() => expect(cardsIn('backlog')).toHaveLength(60));
    const before = server.lists.length;
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '높음' }));
    await waitFor(() => expect(headerCount('backlog')).toHaveTextContent('50'));
    const after = server.lists.slice(before);
    const boardAfter = after.filter((query) => query.limit !== 1);
    expect(boardAfter.map((query) => query.status).sort()).toEqual([...STATUSES].sort());
    for (const query of boardAfter) {
      expect(query).toMatchObject({ priority: 'high', limit: 50 });
      expect(query.cursor).toBeUndefined();
    }
    expect(after.filter((query) => query.limit === 1)).toEqual([]);
    expect(stat('전체 Task')).toHaveTextContent('187');
  });

  it.each([
    ['actor only', ['김담당'], 'assignee', ACTOR],
    ['actor and unassigned', ['김담당', '미배정'], 'assignee', `${ACTOR},unassigned`],
    ['unassigned only', ['미배정'], 'assignee', 'unassigned'],
    ['exact Milestone', ['MLS-1 Launch'], 'milestone_id', MILESTONE_ID],
    ['presence', ['Milestone 있음'], 'milestone_id', 'any'],
    ['absence', ['Milestone 없음'], 'milestone_id', 'none'],
    [
      'exact Milestone with absence',
      ['MLS-1 Launch', 'Milestone 없음'],
      'milestone_id',
      `${MILESTONE_ID},none`,
    ],
  ] as const)(
    'sends %s choices as one token list on every board request',
    async (_name, labels, key, token) => {
      mount();
      await screen.findByLabelText('Backlog 열');
      const before = server.lists.length;
      fireEvent.click(screen.getByRole('button', { name: '필터' }));
      for (const label of labels)
        fireEvent.click(await screen.findByRole('checkbox', { name: label }));
      await waitFor(() => {
        const board = server.lists.slice(before).filter((query) => query.limit === 50);
        expect(board.filter((query) => query[key] === token)).toHaveLength(STATUSES.length);
      });
      expect(server.lists.slice(before).filter((query) => query.limit === 1)).toEqual([]);
    },
  );

  it('groups only the open set with no limit and says closed Tasks are excluded', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    const before = server.lists.length;
    fireEvent.click(screen.getByRole('button', { name: '그룹화' }));
    fireEvent.click(await screen.findByRole('radio', { name: '우선순위' }));
    expect(
      await screen.findByText('완료·배포된 Task는 제외됩니다. 상태별 보기에서 확인하세요.'),
    ).toBeInTheDocument();
    const added = server.lists.slice(before).filter((query) => query.limit !== 1);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ status_group: 'open' });
    expect(added[0]?.limit).toBeUndefined();
    expect(added[0]?.status).toBeUndefined();
    await waitFor(() => expect(screen.getByLabelText('높음 열')).toBeInTheDocument());
    expect(
      screen.getByText('완료·배포된 Task는 제외됩니다. 상태별 보기에서 확인하세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText((done[0] as TaskDto).display_id)).not.toBeInTheDocument();
  });

  it('moves a card across columns, adjusts both totals, and restores both when the write fails', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
    const moved = backlog[0] as TaskDto;
    server.hold(moved.id);
    await drag(moved, 'todo');
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('3'));
    expect(headerCount('backlog')).toHaveTextContent('59');
    expect(
      within(column('todo')).getByRole('button', { name: new RegExp(`${moved.display_id}:`) }),
    ).toBeInTheDocument();
    server.holds.lists = true;
    await act(async () => {
      server.holds.release.get(moved.id)?.(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
    expect(headerCount('backlog')).toHaveTextContent('60');
  });

  it('keeps a later move when an earlier move between the same columns is rejected', async () => {
    mount();
    await screen.findByLabelText('Backlog 열');
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
    const a = backlog[0] as TaskDto;
    const b = backlog[1] as TaskDto;
    server.hold(a.id);
    server.hold(b.id);
    await drag(a, 'todo');
    await drag(b, 'todo');
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('4'));
    expect(headerCount('backlog')).toHaveTextContent('58');
    server.holds.lists = true;
    await act(async () => {
      server.holds.release.get(a.id)?.(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('3'));
    expect(headerCount('backlog')).toHaveTextContent('59');
    expect(
      within(column('todo')).getByRole('button', { name: new RegExp(`${b.display_id}:`) }),
    ).toBeInTheDocument();
    expect(
      within(column('todo')).queryByRole('button', { name: new RegExp(`${a.display_id}:`) }),
    ).toBeNull();
    expect(
      within(column('backlog')).getByRole('button', { name: new RegExp(`${a.display_id}:`) }),
    ).toBeInTheDocument();
  });

  it.each(['success first', 'rejection first'] as const)(
    'preserves overlapping move membership and totals across settlement reads: %s',
    async (order) => {
      const { client } = mount();
      await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
      const a = backlog[0] as TaskDto;
      const b = backlog[1] as TaskDto;
      server.hold(a.id);
      server.hold(b.id);
      await drag(a, 'todo');
      await drag(b, 'todo');
      await waitFor(() => expect(headerCount('todo')).toHaveTextContent('4'));
      await act(async () => {
        server.holds.release.get(order === 'success first' ? b.id : a.id)?.(
          order === 'rejection first',
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      await waitFor(() => expect(client.isMutating()).toBe(1));
      // Allow the first settlement's reads to finish before the other write settles.
      await waitFor(() => expect(client.isFetching()).toBe(0));
      if (order === 'rejection first') {
        expect(headerCount('backlog')).toHaveTextContent('59');
        expect(headerCount('todo')).toHaveTextContent('3');
        expect(
          within(column('todo')).getByRole('button', { name: new RegExp(`${b.display_id}:`) }),
        ).toBeInTheDocument();
      }
      // The last refresh stays pending: rollback itself must leave server-truth counts.
      const beforeRefresh = server.boardLists().length;
      server.holds.lists = true;
      await act(async () => {
        server.holds.release.get(order === 'success first' ? a.id : b.id)?.(
          order === 'success first',
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
      await waitFor(() => expect(server.boardLists().length).toBeGreaterThan(beforeRefresh));
      expect(headerCount('backlog')).toHaveTextContent('59');
      expect(headerCount('todo')).toHaveTextContent('3');
      for (const [task, status, absent] of [
        [a, 'backlog', 'todo'],
        [b, 'todo', 'backlog'],
      ] as const) {
        expect(
          within(column(status)).getByRole('button', { name: new RegExp(`${task.display_id}:`) }),
        ).toBeInTheDocument();
        expect(
          within(column(absent)).queryByRole('button', { name: new RegExp(`${task.display_id}:`) }),
        ).toBeNull();
      }
    },
  );

  it('refetches lists and summaries within 1500 ms during continuous overlapping moves', async () => {
    const { client } = mount();
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
    vi.useFakeTimers();
    try {
      const moving = backlog.slice(0, 5);
      for (const task of moving) server.hold(task.id);
      await drag(moving[0] as TaskDto, 'doing');
      await drag(moving[1] as TaskDto, 'doing');
      const before = server.lists.length;
      for (let index = 0; index < 3; index += 1) {
        await act(async () => {
          server.holds.release.get((moving[index] as TaskDto).id)?.(false);
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(client.isMutating()).toBe(1);
        await drag(moving[index + 2] as TaskDto, 'doing');
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
      }
      const refreshed = server.lists.slice(before);
      expect(refreshed.filter((query) => query.limit !== 1)).not.toHaveLength(0);
      expect(refreshed.filter((query) => query.limit === 1)).toHaveLength(3);
      expect(client.isMutating()).toBe(2);
      expect(stat('진행 중')).toHaveTextContent('4');
      expect(headerCount('doing')).toHaveTextContent('6');
      await act(async () => {
        server.holds.release.get((moving[3] as TaskDto).id)?.(true);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(headerCount('doing')).toHaveTextContent('5');
      expect(
        within(column('doing')).getByRole('button', {
          name: new RegExp(`${moving[4]?.display_id}:`),
        }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes a deferred settlement immediately on unmount', async () => {
    const { client, unmount } = mount();
    await waitFor(() => expect(headerCount('todo')).toHaveTextContent('2'));
    const { QueryObserver } = await import('@tanstack/react-query');
    const observer = new QueryObserver(client, {
      queryKey: ['tasks', 'elsewhere'],
      queryFn: async () => (await fetch('/tasks?limit=1')).json(),
      staleTime: Number.POSITIVE_INFINITY,
    });
    const unsubscribe = observer.subscribe(() => {});
    const [a, b] = backlog as [TaskDto, TaskDto, ...TaskDto[]];
    server.hold(a.id);
    server.hold(b.id);
    await drag(a, 'todo');
    await drag(b, 'todo');
    await act(async () => {
      server.holds.release.get(a.id)?.(false);
    });
    await waitFor(() => expect(client.isMutating()).toBe(1));
    const before = server.lists.length;
    try {
      unmount();
      await waitFor(() => expect(server.lists.length).toBeGreaterThan(before));
      expect(client.isMutating()).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it.each([
    ['excluded', 0, '50', '2'],
    ['matching but unloaded', 59, '50', '3'],
  ] as const)(
    'moves the %s detail fallback without inventing filtered membership',
    async (_label, index, sourceTotal, targetTotal) => {
      const task = index === 0 ? (backlog[0] as TaskDto) : makeTask('backlog');
      if (index !== 0) server.tasks.push(task);
      mount({ selectedParam: task.id });
      await screen.findByRole('button', { name: '다음 상태로 이동' });
      fireEvent.click(screen.getByRole('button', { name: '필터' }));
      fireEvent.click(await screen.findByRole('checkbox', { name: '높음' }));
      await waitFor(() =>
        expect(headerCount('backlog')).toHaveTextContent(index === 0 ? '50' : '51'),
      );
      expect(
        within(column('backlog')).queryByRole('button', {
          name: new RegExp(`${task.display_id}:`),
        }),
      ).toBeNull();
      const before = STATUSES.map((status) => ({
        status,
        cards: cardsIn(status).map((card) => card.textContent),
        total: headerCount(status)?.textContent,
      }));
      server.hold(task.id);
      fireEvent.click(screen.getByRole('button', { name: '다음 상태로 이동' }));
      await waitFor(() =>
        expect(server.patches).toEqual([{ id: task.id, body: { status: 'todo' } }]),
      );
      expect(headerCount('backlog')).toHaveTextContent(sourceTotal);
      expect(headerCount('todo')).toHaveTextContent(targetTotal);
      if (index === 0) {
        for (const { status, cards, total } of before) {
          expect(cardsIn(status).map((card) => card.textContent)).toEqual(cards);
          expect(headerCount(status)?.textContent).toBe(total);
        }
      } else {
        expect(
          within(column('todo')).getByRole('button', { name: new RegExp(`${task.display_id}:`) }),
        ).toBeInTheDocument();
      }
      server.holds.lists = true;
      await act(async () => {
        server.holds.release.get(task.id)?.(false);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await waitFor(() =>
        expect(server.detailReads.filter((id) => id === task.id)).toHaveLength(2),
      );
      expect(headerCount('backlog')).toHaveTextContent(sourceTotal);
      expect(headerCount('todo')).toHaveTextContent(targetTotal);
      const detail = document.querySelector('aside') as HTMLElement;
      await waitFor(() => expect(within(detail).getAllByText('Todo').length).toBeGreaterThan(0));
    },
  );

  it('opens a deep-linked Task that no loaded page contains and moves it with the footer action', async () => {
    const unloaded = backlog[59] as TaskDto;
    mount({ selectedParam: unloaded.id });
    const next = await screen.findByRole('button', { name: '다음 상태로 이동' });
    expect(cardsIn('backlog').some((card) => card.textContent?.includes(unloaded.display_id))).toBe(
      false,
    );
    server.detailReads.length = 0;
    const before = server.lists.length;
    fireEvent.click(next);
    await waitFor(() =>
      expect(server.patches).toEqual([{ id: unloaded.id, body: { status: 'todo' } }]),
    );
    await waitFor(() => {
      const refreshed = server.lists.slice(before).filter((query) => query.limit !== 1);
      expect(refreshed.map((query) => query.status)).toEqual(
        expect.arrayContaining(['backlog', 'todo']),
      );
    });
    await waitFor(() => expect(server.detailReads.length).toBeGreaterThan(0));
  });

  it('shows the not-found notice and no card for a deep link that 404s, then opens a valid link', async () => {
    const { rerenderBoard } = mount({ selectedParam: '10000000-0000-0000-0000-00000000ffff' });
    expect(await screen.findByTestId('tasks-link-missing')).toHaveTextContent(
      TASK_LINK_MISSING_MESSAGE,
    );
    expect(screen.queryByRole('button', { name: '다음 상태로 이동' })).toBeNull();
    expect(navigate).toHaveBeenCalledWith({
      to: '/tasks',
      replace: true,
      search: expect.any(Function),
    });
    const valid = backlog[1] as TaskDto;
    rerenderBoard({ selectedParam: valid.id });
    expect(await screen.findByRole('button', { name: '다음 상태로 이동' })).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-link-missing')).toBeNull();
  });

  it('treats an in-scope Task of another Managed System as missing under an explicit scope', async () => {
    const foreign = makeTask('backlog', { primary_managed_system_id: OTHER_MS });
    server.tasks.push(foreign);
    mount({ selectedParam: foreign.id, managedSystem: MS });
    expect(await screen.findByTestId('tasks-link-missing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 상태로 이동' })).toBeNull();
  });

  it('keeps the Managed System scope in the URL when a card is selected and the panel closes', async () => {
    mount({ managedSystem: 'all' });
    await waitFor(() => expect(cardsIn('backlog').length).toBeGreaterThan(0));
    fireEvent.click(cardsIn('backlog')[0] as HTMLElement);
    expect(navigate).toHaveBeenCalledWith({
      to: '/tasks',
      search: { view: 'board', managedSystem: 'all', param: expect.any(String) },
    });
    fireEvent.click(await screen.findByRole('button', { name: '패널 닫기' }));
    const close = navigate.mock.calls.at(-1)?.[0];
    expect(close.replace).toBe(true);
    expect(close.search({ view: 'board', managedSystem: 'all', param: 'x' })).toEqual({
      view: 'board',
      managedSystem: 'all',
    });
  });

  it('shows the public-update chip with q, removes it by dropping the param, and clears it', async () => {
    mount({ publicUpdate: 'missing', q: 'Task' });
    await screen.findByLabelText('Backlog 열');
    const bar = screen.getByRole('group', { name: '적용된 필터' });
    expect(within(bar).getByText('공개 업데이트 없음')).toBeInTheDocument();
    const added = server.boardLists();
    expect(added.every((query) => query.public_update === 'missing' && query.q === 'Task')).toBe(
      true,
    );
    fireEvent.click(within(bar).getByRole('button', { name: '공개 업데이트 없음 필터 제거' }));
    const call = navigate.mock.calls.at(-1)?.[0];
    expect(call.to).toBe('/tasks');
    expect(
      call.search({ view: 'board', public_update: 'missing', q: 'Task', managedSystem: MS }),
    ).toEqual({
      view: 'board',
      q: 'Task',
      managedSystem: MS,
    });
    fireEvent.click(within(bar).getByRole('button', { name: '필터 초기화' }));
    const clear = navigate.mock.calls.at(-1)?.[0];
    expect(clear.search({ view: 'board', public_update: 'missing', managedSystem: MS })).toEqual({
      view: 'board',
      managedSystem: MS,
    });
  });
});
