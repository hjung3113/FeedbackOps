import { fetchTaskRequests, getTaskRequest, resolveActors } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { type TaskRequestDto, listTaskRequestsQuerySchema } from '@fops/shared';
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
  fetchTaskRequests: vi.fn(),
  getTaskRequest: vi.fn(),
  resolveActors: vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'actor', role_level: 'admin' } } }),
}));
vi.mock('@/lib/api/managed-systems', () => ({ fetchManagedSystems: async () => ({ items: [] }) }));
vi.mock('./task-requests/TaskRequestPanel', () => ({
  TaskRequestPanel: ({
    item,
    onClose,
    onDecisionComplete,
  }: {
    item: TaskRequestDto;
    onClose: () => void;
    onDecisionComplete: (item: TaskRequestDto) => void;
  }) => (
    <section data-testid="detail">
      {item.display_id}
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" onClick={() => onDecisionComplete({ ...item, status: 'approved' })}>
        Approve
      </button>
    </section>
  ),
}));
const A = '30000000-0000-0000-0000-000000000003';
const B = '30000000-0000-0000-0000-000000000004';
const first: TaskRequestDto = {
  id: 'a1',
  workspace_id: 'workspace',
  display_id: 'REQ-A',
  source_type: 'finding',
  source_id: 'finding',
  primary_managed_system_id: A,
  evidence_summary: 'Evidence',
  requested_outcome: 'Request A',
  requester_actor_id: 'actor',
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const second = {
  ...first,
  id: 'b1',
  display_id: 'REQ-B',
  requested_outcome: 'Request B',
  primary_managed_system_id: B,
};
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
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history, client, ...view };
}
const initial = `/tasks?view=requests&managedSystem=${A}&public_update=missing`;
beforeEach(() => {
  vi.mocked(fetchTaskRequests).mockReset();
  vi.mocked(getTaskRequest).mockReset();
  vi.mocked(resolveActors).mockResolvedValue({ actors: [], teams: [] });
  vi.mocked(fetchTaskRequests).mockResolvedValue({
    items: [first],
    page: { total: 1, has_more: false },
  });
});
afterEach(cleanup);

it.each(['click', 'URL entry'] as const)(
  'pushes row selection with scope and other search keys, restores detail, and stays closed after %s selection',
  async (entry) => {
    vi.mocked(fetchTaskRequests).mockResolvedValue({
      items: [first, { ...second, primary_managed_system_id: A }],
      page: { total: 2, has_more: false },
    });
    const mounted = mount(initial);
    expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
    expect(mounted.router.state.location.search.param).toBeUndefined();
    fireEvent.click(await screen.findByRole('button', { name: /REQ-B/ }));
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        view: 'requests',
        managedSystem: A,
        public_update: 'missing',
        param: 'b1',
      }),
    );
    expect(mounted.history.length).toBe(2);
    const url = mounted.router.state.location.href;
    mounted.unmount();
    const restored = mount(url);
    expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-B');
    let closing = restored;
    if (entry === 'click') {
      restored.unmount();
      closing = mount(initial);
      expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
      fireEvent.click(screen.getByRole('button', { name: /REQ-B/ }));
      await waitFor(() => expect(closing.router.state.location.search.param).toBe('b1'));
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /REQ-A/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /REQ-B/ })).toBeInTheDocument();
      expect(closing.router.state.location.search).toEqual({
        view: 'requests',
        managedSystem: A,
        public_update: 'missing',
      });
    });
    expect(closing.history.length).toBe(entry === 'URL entry' ? 1 : 2);
    fireEvent.click(screen.getByRole('button', { name: /REQ-B/ }));
    await waitFor(() => expect(closing.router.state.location.search.param).toBe('b1'));
    expect(screen.getByTestId('detail')).toHaveTextContent('REQ-B');
    expect(closing.history.length).toBe(entry === 'URL entry' ? 2 : 3);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await waitFor(() => {
      expect(closing.router.state.location.search.param).toBeUndefined();
      expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
    expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
    expect(closing.router.state.location.search.param).toBeUndefined();
  },
);

it.each(['scope', 'URL param'] as const)('resets a closed panel on a new %s', async (context) => {
  vi.mocked(fetchTaskRequests).mockImplementation(async (query) => ({
    items: query?.managed_system_id === B ? [second] : [first],
    page: { total: 1, has_more: false },
  }));
  vi.mocked(getTaskRequest).mockResolvedValue(first);
  const mounted = mount(initial);
  expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });
  await waitFor(() => expect(screen.queryByTestId('detail')).not.toBeInTheDocument());
  await act(async () => {
    await mounted.router.navigate({
      to: '/tasks',
      search: {
        view: 'requests',
        managedSystem: context === 'scope' ? B : A,
        ...(context === 'URL param' ? { param: 'a1' } : {}),
        public_update: 'missing',
      },
    });
  });
  expect(await screen.findByTestId('detail')).toHaveTextContent(
    context === 'scope' ? 'REQ-B' : 'REQ-A',
  );
  if (context === 'URL param') {
    await act(async () => {
      await mounted.router.navigate({
        to: '/tasks',
        search: { view: 'requests', managedSystem: A, public_update: 'missing' },
      });
    });
    expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
  }
  expect(mounted.router.state.location.search.param).toBeUndefined();
});

it.each(['404', 'out-of-scope'] as const)(
  'replaces a %s param without writing the first row',
  async (state) => {
    vi.mocked(getTaskRequest).mockImplementation(async () => {
      if (state === '404')
        throw new ApiError(404, { code: 'not_found.record', message: 'Missing' });
      return second;
    });
    const mounted = mount(`${initial}&param=b1`);
    await waitFor(() =>
      expect(mounted.client.getQueryState(['task-request', 'b1'])?.status).toBe(
        state === '404' ? 'error' : 'success',
      ),
    );
    await waitFor(() =>
      expect(mounted.router.state.location.search).toEqual({
        view: 'requests',
        managedSystem: A,
        public_update: 'missing',
      }),
    );
    expect(mounted.history.length).toBe(1);
    await waitFor(() => expect(screen.queryByTestId('detail')).not.toBeInTheDocument());
  },
);

it('keeps the new cross-scope param while the previous off-page detail is cached', async () => {
  let releaseB!: () => void;
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  vi.mocked(fetchTaskRequests).mockImplementation(async (query) => {
    if (query?.managed_system_id === B) await pendingB;
    return { items: [], page: { total: 1, has_more: false } };
  });
  vi.mocked(getTaskRequest).mockImplementation(async (id) => (id === 'a1' ? first : second));
  const mounted = mount(`${initial}&param=a1`);
  expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
  await act(async () => {
    await mounted.router.navigate({
      to: '/tasks',
      search: { view: 'requests', managedSystem: B, param: 'b1', public_update: 'missing' },
    });
  });
  expect(mounted.router.state.location.search.param).toBe('b1');
  await act(async () => {
    releaseB();
  });
  expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-B');
  expect(mounted.router.state.location.search.param).toBe('b1');
});

it('replaces the URL with the decided request and keeps its result-tab detail', async () => {
  vi.mocked(getTaskRequest).mockResolvedValue({ ...first, status: 'approved' });
  const mounted = mount(initial);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(mounted.router.state.location.search.param).toBe('a1'));
  expect(mounted.history.length).toBe(1);
  expect(mounted.router.state.location.search).toEqual({
    view: 'requests',
    managedSystem: A,
    public_update: 'missing',
    param: 'a1',
  });
  expect(screen.getByRole('tab', { name: /^승인됨/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('detail')).toHaveTextContent('REQ-A');
});

// #1022 mocks parse the strict API query and keep summary reads separate from pages.
function mockQueue(records: TaskRequestDto[] = [first, second], offPage: string[] = []) {
  vi.mocked(fetchTaskRequests).mockImplementation(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTaskRequestsQuerySchema.parse(raw);
    const scoped = records.filter(
      (item) =>
        !query.managed_system_id ||
        query.managed_system_id === 'all' ||
        item.primary_managed_system_id === query.managed_system_id,
    );
    if (query.limit === 1)
      return { items: scoped.slice(0, 1), page: { total: scoped.length, has_more: false } };
    const items = scoped.filter(
      (item) => (!query.status || item.status === query.status) && !offPage.includes(item.id),
    );
    return { items, page: { total: items.length, has_more: false } };
  });
  vi.mocked(getTaskRequest).mockImplementation(async (id) => {
    const item = records.find((record) => record.id === id);
    if (!item) throw new ApiError(404, { code: 'not_found.record', message: 'Missing' });
    return item;
  });
}
async function settledQueue(mounted: ReturnType<typeof mount>) {
  await act(async () => {
    await mounted.client.refetchQueries({ queryKey: ['task-requests'] });
  });
  await waitFor(() => expect(mounted.client.isFetching()).toBe(0));
  await act(async () => {
    await Promise.resolve();
  });
}
function expectMissingQueue(mounted: ReturnType<typeof mount>) {
  expect(mounted.router.state.location.search).toEqual({
    view: 'requests',
    managedSystem: A,
    public_update: 'missing',
  });
  expect(screen.getByTestId('tasks-link-missing')).toHaveTextContent(
    '요청한 Task Request를 찾을 수 없습니다. 삭제되었거나 현재 권한·범위 밖일 수 있습니다.',
  );
  expect(screen.getByTestId('tasks-link-missing')).toHaveRole('status');
  expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  expect(document.querySelector('[aria-selected="true"]:not([role="tab"])')).toBeNull();
  expect(screen.queryByTestId('object-row-selected-bar')).not.toBeInTheDocument();
}
it.each(['404', 'out-of-scope'] as const)(
  'keeps the missing-link notice through URL cleanup and refetch (%s)',
  async (cause) => {
    const offPage: string[] = [];
    mockQueue([first, second], offPage);
    const mounted = mount(`${initial}&param=${cause === '404' ? 'missing' : 'b1'}`);
    await screen.findByTestId('tasks-link-missing');
    await waitFor(() => expect(mounted.router.state.location.search.param).toBeUndefined());
    expect(mounted.history.length).toBe(1);
    expectMissingQueue(mounted);
    // A refetch can move the first row off this page; it must not become a hidden detail selection.
    offPage.push(first.id);
    await settledQueue(mounted);
    expectMissingQueue(mounted);
    expect(vi.mocked(getTaskRequest).mock.calls.map(([id]) => id)).not.toContain(first.id);
    expect(mounted.history.length).toBe(1);
  },
);
it.each(['row', 'tab', 'scope', 'param'] as const)(
  'clears a missing-link notice on a new %s',
  async (change) => {
    mockQueue();
    const mounted = mount(`${initial}&param=missing`);
    await screen.findByTestId('tasks-link-missing');
    await waitFor(() => expect(mounted.router.state.location.search.param).toBeUndefined());
    if (change === 'row') fireEvent.click(screen.getByRole('button', { name: /REQ-A/ }));
    else if (change === 'tab') fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
    else
      await act(async () => {
        await mounted.router.navigate({
          to: '/tasks',
          search: {
            view: 'requests',
            managedSystem: change === 'scope' ? B : A,
            ...(change === 'param' ? { param: 'a1' } : {}),
            public_update: 'missing',
          },
        });
      });
    expect(await screen.findByTestId('detail')).toHaveTextContent(
      change === 'scope' ? 'REQ-B' : 'REQ-A',
    );
    expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
    await settledQueue(mounted);
    expect(mounted.router.state.location.search.param).toBe(
      change === 'row' || change === 'param' ? 'a1' : undefined,
    );
    expect(mounted.history.length).toBe(change === 'tab' ? 1 : 2);
  },
);

it.each([
  ['approved', '승인됨'],
  ['rejected', '반려됨'],
  ['converted', '전체'],
] as const)(
  'follows restored %s detail once, including off-page destination detail',
  async (status, label) => {
    const restored = { ...first, id: 'restored', display_id: 'REQ-RESTORED', status };
    const destinationRow = { ...first, id: 'destination', display_id: 'REQ-DESTINATION', status };
    mockQueue([first, destinationRow, restored], [restored.id]);
    const mounted = mount(`${initial}&param=${restored.id}`);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: new RegExp(`^${label}`) })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    await settledQueue(mounted);
    expect(screen.getByTestId('detail')).toHaveTextContent('REQ-RESTORED');
    expect(mounted.router.state.location.search.param).toBe('restored');
    expect(mounted.history.length).toBe(1);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^검토 대기/ }));
    await settledQueue(mounted);
    expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('detail')).toHaveTextContent('REQ-RESTORED');
  },
);
it('consumes a decided param while all is active without switching tabs', async () => {
  const decided = {
    ...first,
    id: 'decided',
    display_id: 'REQ-DECIDED',
    status: 'approved' as const,
  };
  mockQueue([first, decided], [decided.id]);
  const mounted = mount(initial);
  await screen.findByTestId('detail');
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
  await settledQueue(mounted);
  await act(async () => {
    await mounted.router.navigate({
      to: '/tasks',
      search: { view: 'requests', managedSystem: A, param: decided.id, public_update: 'missing' },
    });
  });
  await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('REQ-DECIDED'));
  await settledQueue(mounted);
  expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true');
  expect(mounted.router.state.location.search.param).toBe(decided.id);
  expect(mounted.history.length).toBe(2);
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^검토 대기/ }));
  await settledQueue(mounted);
  expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute('aria-selected', 'true');
});
it('consumes a pending param even when its status already matches the active tab', async () => {
  mockQueue();
  const mounted = mount(`${initial}&param=a1`);
  expect(await screen.findByTestId('detail')).toHaveTextContent('REQ-A');
  await settledQueue(mounted);
  expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
  await settledQueue(mounted);
  expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true');
  expect(mounted.router.state.location.search.param).toBe('a1');
  expect(mounted.history.length).toBe(1);
});
it('follows each param occurrence again through Back and Forward', async () => {
  const approved = { ...first, status: 'approved' as const };
  const rejected = { ...second, primary_managed_system_id: A, status: 'rejected' as const };
  mockQueue([approved, rejected], ['a1', 'b1']);
  const mounted = mount(`${initial}&param=a1`);
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /^승인됨/ })).toHaveAttribute('aria-selected', 'true'),
  );
  await act(async () => {
    await mounted.router.navigate({
      to: '/tasks',
      search: { view: 'requests', managedSystem: A, param: 'b1', public_update: 'missing' },
    });
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /^반려됨/ })).toHaveAttribute('aria-selected', 'true'),
  );
  await settledQueue(mounted);
  expect(screen.getByTestId('detail')).toHaveTextContent('REQ-B');
  expect(mounted.history.length).toBe(2);
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^검토 대기/ }));
  await settledQueue(mounted);
  expect(screen.getByRole('tab', { name: /^검토 대기/ })).toHaveAttribute('aria-selected', 'true');
  await act(async () => {
    mounted.history.back();
  });
  await waitFor(() => {
    expect(mounted.router.state.location.search.param).toBe('a1');
    expect(screen.getByRole('tab', { name: /^승인됨/ })).toHaveAttribute('aria-selected', 'true');
  });
  await settledQueue(mounted);
  expect(screen.getByTestId('detail')).toHaveTextContent('REQ-A');
  await act(async () => {
    mounted.history.forward();
  });
  await waitFor(() => {
    expect(mounted.router.state.location.search.param).toBe('b1');
    expect(screen.getByRole('tab', { name: /^반려됨/ })).toHaveAttribute('aria-selected', 'true');
  });
  await settledQueue(mounted);
  expect(screen.getByTestId('detail')).toHaveTextContent('REQ-B');
  expect(mounted.history.length).toBe(2);
});

it.each(['row', 'scope+param'] as const)(
  'ignores a late 404 after moving to a valid request by %s',
  async (move) => {
    const valid = { ...second, primary_managed_system_id: move === 'row' ? A : B };
    mockQueue([first, valid], ['a1']);
    const detail = vi.mocked(getTaskRequest).getMockImplementation();
    if (!detail) throw new Error('Detail mock must be installed');
    let rejectOld!: (error: ApiError) => void;
    let started = false;
    const oldDetail = new Promise<TaskRequestDto>((_resolve, reject) => {
      rejectOld = reject;
    });
    vi.mocked(getTaskRequest).mockImplementation((id, signal) => {
      if (id === 'a1') {
        started = true;
        return oldDetail;
      }
      return detail(id, signal);
    });
    const mounted = mount(`${initial}&param=a1`);
    await waitFor(() => expect(started).toBe(true));
    if (move === 'row') fireEvent.click(screen.getByRole('button', { name: /REQ-B/ }));
    else
      await act(async () => {
        await mounted.router.navigate({
          to: '/tasks',
          search: { view: 'requests', managedSystem: B, param: 'b1', public_update: 'missing' },
        });
      });
    await waitFor(() => {
      expect(mounted.router.state.location.search.param).toBe('b1');
      expect(screen.getByTestId('detail')).toHaveTextContent('REQ-B');
    });
    const replace = vi.spyOn(mounted.history, 'replace');
    await act(async () => {
      rejectOld(new ApiError(404, { code: 'not_found.record', message: 'Late missing' }));
    });
    await settledQueue(mounted);
    expect(mounted.router.state.location.search).toEqual({
      view: 'requests',
      managedSystem: move === 'row' ? A : B,
      param: 'b1',
      public_update: 'missing',
    });
    expect(screen.getByTestId('detail')).toHaveTextContent('REQ-B');
    expect(screen.queryByTestId('tasks-link-missing')).not.toBeInTheDocument();
    expect(mounted.history.length).toBe(2);
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  },
);
