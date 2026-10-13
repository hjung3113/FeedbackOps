import { getTask, listTasks } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { type TaskDetailDto, listTasksQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@fops/ui', async (original) => ({
  ...(await original<typeof import('@fops/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => (
    <main>
      {list}
      <aside>{detailPanel}</aside>
    </main>
  ),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '20000000-0000-0000-0000-000000000002', role_level: 'admin' } },
  }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));
vi.mock('../components/TaskDetailPanel', () => ({
  TaskDetailPanel: ({ taskId, onClose }: { taskId: string; onClose: () => void }) => (
    <section data-testid="detail">
      {taskId}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  ),
}));
const A = '30000000-0000-0000-0000-000000000003';
const B = '30000000-0000-0000-0000-000000000004';
const actor = '20000000-0000-0000-0000-000000000002';
const first: TaskDetailDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'TASK-1000',
  primary_managed_system_id: A,
  title: '매출 리포트 쿼리 플랜 개선',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: actor,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: actor,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};
const second: TaskDetailDto = {
  ...first,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'TASK-1001',
  title: '다른 Task',
  primary_managed_system_id: B,
};
const sameScope = { ...second, primary_managed_system_id: A };
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: () => <TasksRouteView search={route.useSearch()} />,
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history, client, ...rendered };
}
const initial = `/tasks?view=backlog&managedSystem=${A}&public_update=missing`;
function mockTasks(records: TaskDetailDto[] = [first, sameScope], offPage: string[] = []) {
  vi.mocked(listTasks).mockImplementation(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTasksQuerySchema.parse(raw);
    const items = records.filter(
      (item) =>
        (!query.managed_system_id ||
          query.managed_system_id === 'all' ||
          item.primary_managed_system_id === query.managed_system_id) &&
        (!query.status || item.status === query.status) &&
        (!query.assignee ||
          item.assignee_actor_id === (query.assignee === 'me' ? actor : query.assignee)) &&
        !offPage.includes(item.id),
    );
    return { items, page: { total: items.length, has_more: false } };
  });
  vi.mocked(getTask).mockImplementation(async (id) => {
    const item = records.find((record) => record.id === id);
    if (!item) throw new ApiError(404, { code: 'not_found.record', message: 'Missing' });
    return item;
  });
}
async function settle(mounted: ReturnType<typeof mount>) {
  await act(async () => {
    await mounted.client.refetchQueries({ queryKey: ['tasks'] });
  });
  await waitFor(() => expect(mounted.client.isFetching()).toBe(0));
  await act(async () => {
    await Promise.resolve();
  });
}
function expectNoSelectedRow() {
  expect(screen.queryByTestId('object-row-selected-bar')).not.toBeInTheDocument();
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.mocked(listTasks).mockReset();
  vi.mocked(getTask).mockReset();
  mockTasks();
});
afterEach(cleanup);

it.each(['empty', 'populated'] as const)(
  'follows My Task after an unassigned backlog auto-selection (%s)',
  async (state) => {
    mockTasks([
      { ...first, assignee_actor_id: null },
      ...(state === 'populated' ? [sameScope] : []),
    ]);
    const mounted = mount('/tasks?view=backlog');
    expect(await screen.findByTestId('detail')).toHaveTextContent(first.id);

    await act(async () => {
      await mounted.router.navigate({ to: '/tasks', search: { view: 'my' } });
    });
    await settle(mounted);

    if (state === 'populated') {
      expect(await screen.findByTestId('detail')).toHaveTextContent(sameScope.id);
    } else {
      expect(screen.getByText('나에게 배정된 Task가 없습니다.')).toBeInTheDocument();
      expectNoSelectedRow();
    }
    expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
  },
);

it.each(['backlog', 'my'] as const)(
  'pushes row selection keeping every search key in %s',
  async (view) => {
    const mounted = mount(initial.replace('view=backlog', `view=${view}`));
    await screen.findByTestId('detail');
    fireEvent.click(screen.getByRole('button', { name: /TASK-1001/ }));
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        view,
        managedSystem: A,
        public_update: 'missing',
        param: second.id,
      }),
    );
    expect(mounted.history.length).toBe(2);
    expect(screen.getByTestId('detail')).toHaveTextContent(second.id);
  },
);
it('closes with replace and keeps scope, stays closed through refetch, and reopens on row selection', async () => {
  const mounted = mount(`${initial}&param=${first.id}`);
  await screen.findByTestId('detail');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(mounted.router.state.location.search).toEqual({
      view: 'backlog',
      managedSystem: A,
      public_update: 'missing',
    }),
  );
  expect(mounted.history.length).toBe(1);
  expectNoSelectedRow();
  await settle(mounted);
  expectNoSelectedRow();
  fireEvent.click(screen.getByRole('button', { name: /TASK-1001/ }));
  await waitFor(() => expect(mounted.router.state.location.search.param).toBe(second.id));
  expect(screen.getByTestId('detail')).toHaveTextContent(second.id);
  expect(mounted.history.length).toBe(2);
});
it.each(['view', 'scope', 'param'] as const)(
  'resumes selection after a closed panel gets a new %s',
  async (change) => {
    mockTasks([first, second]);
    const mounted = mount(`${initial}&param=${first.id}`);
    await screen.findByTestId('detail');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(mounted.router.state.location.search.param).toBeUndefined());
    expectNoSelectedRow();
    await act(async () => {
      await mounted.router.navigate({
        to: '/tasks',
        search: {
          view: change === 'view' ? 'my' : 'backlog',
          managedSystem: change === 'scope' ? B : A,
          ...(change === 'param' ? { param: first.id } : {}),
          public_update: 'missing',
        },
      });
    });
    expect(await screen.findByTestId('detail')).toHaveTextContent(
      change === 'scope' ? second.id : first.id,
    );
    await settle(mounted);
    expect(mounted.router.state.location.search.param).toBe(
      change === 'param' ? first.id : undefined,
    );
    expect(mounted.history.length).toBe(2);
  },
);
it.each(['404', 'scope', 'assignee'] as const)(
  'keeps a missing-link notice after %s cleanup, URL settlement and list refetch',
  async (cause) => {
    const inaccessible = {
      ...second,
      primary_managed_system_id: cause === 'scope' ? B : A,
      assignee_actor_id: cause === 'assignee' ? null : actor,
      assignee_team_id: null,
    };
    mockTasks([first, inaccessible]);
    const view = cause === 'assignee' ? 'my' : 'backlog';
    const mounted = mount(
      `${initial.replace('view=backlog', `view=${view}`)}&param=${cause === '404' ? 'missing' : second.id}`,
    );
    await screen.findByTestId('tasks-link-missing');
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        view,
        managedSystem: A,
        public_update: 'missing',
      }),
    );
    expect(mounted.history.length).toBe(1);
    expectNoSelectedRow();
    await settle(mounted);
    expect(screen.getByTestId('tasks-link-missing')).toHaveTextContent(
      '요청한 Task를 찾을 수 없습니다. 삭제되었거나 현재 권한·범위 밖일 수 있습니다.',
    );
    expect(screen.getByTestId('tasks-link-missing')).toHaveRole('status');
    expectNoSelectedRow();
    expect(vi.mocked(getTask).mock.calls.map(([id]) => id)).not.toContain(first.id);
    expect(mounted.history.length).toBe(1);
  },
);
it.each(['row', 'view', 'scope', 'param'] as const)(
  'clears a missing-link notice on a new %s',
  async (change) => {
    mockTasks([first, second]);
    const mounted = mount(`${initial}&param=missing`);
    await screen.findByTestId('tasks-link-missing');
    await waitFor(() => expect(mounted.router.state.location.search.param).toBeUndefined());
    if (change === 'row') fireEvent.click(screen.getByRole('button', { name: /TASK-1000/ }));
    else
      await act(async () => {
        await mounted.router.navigate({
          to: '/tasks',
          search: {
            view: change === 'view' ? 'my' : 'backlog',
            managedSystem: change === 'scope' ? B : A,
            ...(change === 'param' ? { param: first.id } : {}),
            public_update: 'missing',
          },
        });
      });
    expect(await screen.findByTestId('detail')).toHaveTextContent(
      change === 'scope' ? second.id : first.id,
    );
    expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
    await settle(mounted);
    expect(mounted.router.state.location.search.param).toBe(
      change === 'row' || change === 'param' ? first.id : undefined,
    );
    expect(mounted.history.length).toBe(2);
  },
);
it('keeps a new cross-scope param while the previous off-page detail is cached', async () => {
  mockTasks([first, second], [first.id, second.id]);
  const fetch = vi.mocked(listTasks).getMockImplementation();
  if (!fetch) throw new Error('List mock must be installed');
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(listTasks).mockImplementation(async (options) => {
    const { signal: _signal, ...raw } = options ?? {};
    if (listTasksQuerySchema.parse(raw).managed_system_id === B) await waiting;
    return fetch(options);
  });
  const mounted = mount(`${initial}&param=${first.id}`);
  expect(await screen.findByTestId('detail')).toHaveTextContent(first.id);
  await act(async () => {
    await mounted.router.navigate({
      to: '/tasks',
      search: { view: 'backlog', managedSystem: B, param: second.id, public_update: 'missing' },
    });
  });
  expect(mounted.router.state.location.search.param).toBe(second.id);
  await act(async () => {
    release();
  });
  expect(await screen.findByTestId('detail')).toHaveTextContent(second.id);
  await settle(mounted);
  expect(mounted.router.state.location.search).toEqual({
    view: 'backlog',
    managedSystem: B,
    param: second.id,
    public_update: 'missing',
  });
  expect(mounted.history.length).toBe(2);
  expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
});

it.each(['row', 'scope+param'] as const)(
  'ignores a late 404 after moving to a valid Task by %s',
  async (move) => {
    const valid = move === 'row' ? sameScope : second;
    mockTasks([first, valid], [first.id]);
    const detail = vi.mocked(getTask).getMockImplementation();
    if (!detail) throw new Error('Detail mock must be installed');
    let rejectOld!: (error: ApiError) => void;
    let started = false;
    const oldDetail = new Promise<TaskDetailDto>((_resolve, reject) => {
      rejectOld = reject;
    });
    vi.mocked(getTask).mockImplementation((id, signal) => {
      if (id === first.id) {
        started = true;
        return oldDetail;
      }
      return detail(id, signal);
    });
    const mounted = mount(`${initial}&param=${first.id}`);
    await waitFor(() => expect(started).toBe(true));
    if (move === 'row') fireEvent.click(await screen.findByRole('button', { name: /TASK-1001/ }));
    else
      await act(async () => {
        await mounted.router.navigate({
          to: '/tasks',
          search: { view: 'backlog', managedSystem: B, param: second.id, public_update: 'missing' },
        });
      });
    await waitFor(() => {
      expect(mounted.router.state.location.search.param).toBe(second.id);
      expect(screen.getByTestId('detail')).toHaveTextContent(second.id);
    });
    const replace = vi.spyOn(mounted.history, 'replace');
    await act(async () => {
      rejectOld(new ApiError(404, { code: 'not_found.record', message: 'Late missing' }));
    });
    await settle(mounted);
    expect(mounted.router.state.location.search).toEqual({
      view: 'backlog',
      managedSystem: move === 'row' ? A : B,
      param: second.id,
      public_update: 'missing',
    });
    expect(screen.getByTestId('detail')).toHaveTextContent(second.id);
    expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
    expect(mounted.history.length).toBe(2);
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  },
);
