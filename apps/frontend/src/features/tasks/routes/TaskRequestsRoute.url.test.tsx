import { fetchTaskRequests, getTaskRequest, resolveActors } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import type { TaskRequestDto } from '@fops/shared';
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
    await waitFor(() => expect(screen.queryByTestId('detail')).not.toHaveTextContent('REQ-B'));
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
