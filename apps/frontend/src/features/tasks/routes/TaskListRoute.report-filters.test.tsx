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
const filters = {
  'filter.analytics_area': 'unset',
  status: 'backlog',
  status_group: 'in-flight',
  overdue: true,
  public_update: 'missing',
  reporter_update: 'needed',
} as const;
const initial = `/tasks?view=backlog&managedSystem=${A}&${new URLSearchParams({ ...filters, overdue: 'true' })}`;
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
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({
  useAnalyticsAreaFilterLabel: (area: string | undefined) =>
    area === 'unset' ? 'Analytics Area: 미지정' : areaLabel,
}));
let areaLabel = 'Analytics Area: Revenue';
beforeEach(() => {
  vi.mocked(listTasks).mockReset();
  vi.mocked(getTask).mockReset();
  areaLabel = 'Analytics Area: Revenue';
  mockTasks();
});
afterEach(cleanup);

it('keeps overdue=true in the address and sends the wire string', async () => {
  const mounted = mount('/tasks?view=backlog&overdue=true');
  await screen.findByTestId('detail');
  expect(mounted.router.state.location.search).toEqual({ view: 'backlog', overdue: true });
  expect(mounted.router.state.location.searchStr).toBe('?view=backlog&overdue=true');
  const { signal: _signal, ...sent } = vi.mocked(listTasks).mock.calls.at(-1)?.[0] ?? {};
  expect(listTasksQuerySchema.parse(sent)).toEqual({ limit: 50, overdue: 'true' });
});

it.each(['backlog', 'my'] as const)(
  'keeps all report filters on selection and close in %s',
  async (view) => {
    const mounted = mount(initial.replace('view=backlog', `view=${view}`));
    await screen.findByTestId('detail');
    fireEvent.click(screen.getByRole('button', { name: /TASK-1001/ }));
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        ...filters,
        view,
        managedSystem: A,
        param: second.id,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        ...filters,
        view,
        managedSystem: A,
      }),
    );
    await settle(mounted);
    expectNoSelectedRow();
  },
);

it('removes a single key, restores it with Back/Forward, then clears all filters keeping context', async () => {
  const mounted = mount(`${initial}&param=${first.id}`);
  await screen.findByTestId('detail');
  expect(screen.getByRole('button', { name: '상태: Backlog 필터 제거' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '상태: Todo·Doing·Review 필터 제거' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '공개 업데이트 없음 필터 제거' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '기한 지남 필터 제거' }));
  const { overdue: _overdue, ...remaining } = filters;
  await waitFor(() =>
    expect(mounted.router.state.location.search).toEqual({
      ...remaining,
      view: 'backlog',
      managedSystem: A,
      param: first.id,
    }),
  );
  await act(async () => {
    mounted.history.back();
  });
  await waitFor(() => expect(mounted.router.state.location.search.overdue).toBe(true));
  expect(await screen.findByRole('button', { name: '기한 지남 필터 제거' })).toBeInTheDocument();
  await act(async () => {
    mounted.history.forward();
  });
  await waitFor(() => expect(mounted.router.state.location.search.overdue).toBeUndefined());
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  await waitFor(() =>
    expect(mounted.router.state.location.search).toEqual({
      view: 'backlog',
      managedSystem: A,
      param: first.id,
    }),
  );
  expect(screen.queryByRole('group', { name: '적용된 필터' })).not.toBeInTheDocument();
});

it.each([
  ['unset', 'Analytics Area: 미지정'],
  [A, 'Analytics Area: Revenue'],
  [A, 'Analytics Area: Revenue (보관됨)'],
  [A, 'Analytics Area: 선택한 Area'],
])('renders and removes Area %s as %s', async (area, label) => {
  areaLabel = label;
  const mounted = mount(`/tasks?view=backlog&filter.analytics_area=${area}&public_update=missing`);
  const remove = await screen.findByRole('button', { name: `${label} 필터 제거` });
  fireEvent.click(remove);
  await waitFor(() =>
    expect(mounted.router.state.location.search).toEqual({
      view: 'backlog',
      public_update: 'missing',
    }),
  );
});

it('names intersecting filters in the filtered-empty state with one reset', async () => {
  mockTasks([]);
  mount(initial);
  expect(await screen.findByText('현재 조건에 맞는 Task가 없습니다')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
  expect(
    screen.getByText(
      'Analytics Area: 미지정 · 상태: Backlog · 상태: Todo·Doing·Review · 기한 지남 · 공개 업데이트 없음 · 보고자 업데이트 필요',
    ),
  ).toBeInTheDocument();
});

it.each([
  ['filter.analytics_area', 'Analytics Area: 미지정'],
  ['status', '상태: Backlog'],
  ['status_group', '상태: Todo·Doing·Review'],
  ['overdue', '기한 지남'],
  ['public_update', '공개 업데이트 없음'],
  ['reporter_update', '보고자 업데이트 필요'],
] as const)('removes only Task %s and requests the remaining intersection', async (key, label) => {
  const mounted = mount(initial);
  fireEvent.click(await screen.findByRole('button', { name: `${label} 필터 제거` }));
  const expected: Partial<typeof filters> = { ...filters };
  delete expected[key];
  await waitFor(() =>
    expect(mounted.router.state.location.search).toEqual({
      ...expected,
      view: 'backlog',
      managedSystem: A,
    }),
  );
  await settle(mounted);
  const { signal: _signal, ...sent } = vi.mocked(listTasks).mock.calls.at(-1)?.[0] ?? {};
  const query = listTasksQuerySchema.parse(sent);
  expect(query).toEqual({
    limit: 50,
    managed_system_id: A,
    ...(key === 'filter.analytics_area' ? {} : { analytics_area_id: 'unset' }),
    ...(key === 'status' ? {} : { status: 'backlog' }),
    ...(key === 'status_group' ? {} : { status_group: 'in-flight' }),
    ...(key === 'overdue' ? {} : { overdue: 'true' }),
    ...(key === 'public_update' ? {} : { public_update: 'missing' }),
    ...(key === 'reporter_update' ? {} : { reporter_update: 'needed' }),
  });
});
