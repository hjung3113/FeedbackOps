import { VocClusterListShell } from '@/features/voc-cluster/components/detail/VocClusterListShell';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clusterSuggestionsFixture } from '../../../../tests/visual/fixtures/cluster-suggestions';
import { IDS, populatedList } from '../../../../tests/visual/fixtures/voc-clusters';
import { VocClusterListPage, vocClustersSearchSchema } from './index';

let available = true;
let listRead: () => Promise<Response>;
let suggestionRead: () => Promise<Response>;
let unreadableClusterId: string | null = null;
let role = 'admin';
const pair = clusterSuggestionsFixture.items[0];
if (!pair) throw new Error('Suggestion fixture missing');
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
function me() {
  return {
    actor: {
      id: IDS.actor,
      external_id: 'admin',
      email: 'admin@example.test',
      display_name: '관리자',
      role_level: role,
    },
    workspace_id: IDS.workspace,
  };
}
function DetailPanelSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}
function Root() {
  return (
    <DetailPanelSlotProvider>
      <Outlet />
      <DetailPanelSlotHost />
    </DetailPanelSlotProvider>
  );
}
function mount(initialPath = `/voc-clusters?selected=${IDS.draft}`) {
  const root = createRootRoute({ component: Root });
  const list = createRoute({
    getParentRoute: () => root,
    path: '/voc-clusters',
    validateSearch: (raw) => vocClustersSearchSchema.parse(raw),
    component: VocClusterListPage,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/voc-clusters/$clusterId',
    component: () => {
      const { clusterId } = detail.useParams();
      return (
        <VocClusterListShell
          selectedId={clusterId}
          onSelect={() => {
            throw new Error('Unexpected detail navigation');
          }}
          onCloseDetail={() => {
            throw new Error('Unexpected detail close');
          }}
        />
      );
    },
  });
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree: root.addChildren([list, detail]), history });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client, history, ...view };
}
function mountWithProductionCallbacks(initialPath: string) {
  const root = createRootRoute({ component: Root });
  const list = createRoute({
    getParentRoute: () => root,
    path: '/voc-clusters',
    validateSearch: (raw) => vocClustersSearchSchema.parse(raw),
    component: VocClusterListPage,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/voc-clusters/$clusterId',
    component: () => {
      const { clusterId } = detail.useParams();
      const navigate = useNavigate();
      return (
        <VocClusterListShell
          selectedId={clusterId}
          onSelect={(id) =>
            void navigate({ to: '/voc-clusters/$clusterId', params: { clusterId: id } })
          }
          onCloseDetail={() => void navigate({ to: '/voc-clusters' })}
        />
      );
    },
  });
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const router = createRouter({ routeTree: root.addChildren([list, detail]), history });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history };
}
async function enter() {
  const tab = await screen.findByRole('tab', { name: /^Cluster 제안/ });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(await screen.findByRole('button', { name: /VOC-12/ }));
  await screen.findByText(
    '결제 내역 화면에서 지난달 청구 금액을 찾기 어렵습니다. 월별 내역을 한눈에 볼 수 있으면 좋겠습니다.',
  );
}
beforeEach(() => {
  role = 'admin';
  available = true;
  unreadableClusterId = null;
  listRead = async () => json(populatedList);
  suggestionRead = async () =>
    json(
      available
        ? clusterSuggestionsFixture
        : { available: false, reason: 'provider_disabled', items: [] },
    );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, _init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/me') return json(me());
      if (url.pathname === '/voc-clusters') return listRead();
      if (url.pathname === '/voc-cluster-suggestions') return suggestionRead();
      if (url.pathname.endsWith('/discard'))
        return json({
          id: pair.id,
          revision: 2,
          discarded_at: new Date().toISOString(),
          undo_until: new Date(Date.now() + 300000).toISOString(),
        });
      if (url.pathname === `/voc-clusters/${unreadableClusterId}`)
        return json({ code: 'not_found.record', message: 'not found' }, 404);
      if (url.pathname.startsWith('/voc-clusters/'))
        return json(populatedList.items.find((item) => item.id === url.pathname.split('/')[2]));
      if (url.pathname === '/managed-systems') return json({ items: [], total: 0 });
      if (url.pathname === '/me/permissions/check')
        return json({
          state: 'approved',
          decision: { allow: true, via: 'role', requestable: null },
        });
      return json({ code: 'not_found.record', message: 'not found' }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(['admin', 'developer'])(
  'preserves selected URL/history on tab exit, local close and refetch for %s',
  async (actorRole) => {
    role = actorRole;
    const { client, history } = mount();
    await enter();
    const href = history.location.href;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['voc-clusters'] });
    });
    expect(history.location.href).toBe(href);
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() =>
      expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument(),
    );
    expect(history.location.href).toBe(href);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }), { button: 0 });
    await screen.findByTestId('cluster-detail-title');
    expect(history.location.href).toBe(href);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Cluster 제안/ }), { button: 0 });
    expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument();
  },
);
it('defers the first-success Cluster default until returning from suggestions', async () => {
  let release!: (response: Response) => void;
  listRead = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const { history } = mount('/voc-clusters');
  await enter();
  await act(async () => {
    release(json(populatedList));
  });
  expect(history.location.href).toBe('/voc-clusters');
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }), { button: 0 });
  await waitFor(() => expect(history.location.href).toContain('selected='));
  const selected = history.location.href;
  await enter();
  expect(history.location.href).toBe(selected);
});
it('preserves the detail-path host through suggestions and return', async () => {
  const { history } = mount(`/voc-clusters/${IDS.draft}`);
  await enter();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }), { button: 0 });
  await screen.findByTestId('cluster-detail-title');
  expect(history.location.href).toBe(`/voc-clusters/${IDS.draft}`);
});
it('keeps an unreadable detail path and shows no other Cluster', async () => {
  const unreadableId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const initialPath = `/voc-clusters/${unreadableId}`;
  unreadableClusterId = unreadableId;
  listRead = async () => json({ items: populatedList.items.slice(0, 2) });
  const { history } = mountWithProductionCallbacks(initialPath);
  expect(await screen.findByText('Cluster를 찾을 수 없습니다.')).toBeInTheDocument();
  expect(history.location.href).toBe(initialPath);
  expect(screen.queryByTestId('cluster-detail-title')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finding 생성' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Task 요청' })).not.toBeInTheDocument();
});
it('drops pair selection when Managed System context changes', async () => {
  const { router } = mount();
  await enter();
  await act(async () => {
    await router.navigate({
      to: '/voc-clusters',
      search: { selected: IDS.draft, managedSystem: IDS.managedSystem },
    });
  });
  await waitFor(() =>
    expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument(),
  );
  expect(screen.queryByText(pair.vocs[0].title, { selector: 'h3' })).not.toBeInTheDocument();
});
it('hides tab and pair when role eligibility is revoked', async () => {
  const { client } = mount();
  await enter();
  role = 'user';
  await act(async () => {
    client.setQueryData(['me'], me());
  });
  await waitFor(() =>
    expect(screen.queryByRole('tab', { name: /^Cluster 제안/ })).not.toBeInTheDocument(),
  );
  expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument();
});
it.each(['unavailable', 'error', 'loading'])(
  'omits the tab and its badge while availability is %s',
  async (state) => {
    available = false;
    if (state === 'error')
      suggestionRead = async () => json({ code: 'internal.unexpected', message: 'failed' }, 500);
    if (state === 'loading') suggestionRead = () => new Promise(() => {});
    const { client } = mount();
    await screen.findByTestId('cluster-detail-title');
    if (state !== 'loading')
      await waitFor(() =>
        expect(client.isFetching({ queryKey: ['voc-cluster-suggestions'] })).toBe(0),
      );
    expect(screen.queryByRole('tab', { name: /^Cluster 제안/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  },
);
it('returns to default tab without changing the URL when availability becomes false', async () => {
  const { client, history } = mount();
  await enter();
  const href = history.location.href;
  available = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(screen.queryByRole('tab', { name: /^Cluster 제안/ })).not.toBeInTheDocument();
  expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument();
  expect(history.location.href).toBe(href);
});

it('keeps the suggestion tab hidden for a User even when the provider is enabled', async () => {
  role = 'user';
  mount();
  await screen.findByTestId('cluster-detail-title');
  expect(screen.queryByRole('tab', { name: /^Cluster 제안/ })).not.toBeInTheDocument();
});
it('drops undo on tab exit and never restores it on re-entry', async () => {
  mount();
  await enter();
  suggestionRead = async () => json({ available: true, items: [] });
  fireEvent.click(screen.getByRole('button', { name: '기각' }));
  await screen.findByRole('button', { name: '되돌리기' });
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }), { button: 0 });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument(),
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Cluster 제안/ }), { button: 0 });
  await screen.findByText('검토할 Cluster 제안이 없습니다');
  expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
});

it('preserves an absent selected param when availability drops after a deferred first Cluster read', async () => {
  let release!: (response: Response) => void;
  listRead = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const { client, history } = mount('/voc-clusters');
  await enter();
  await act(async () => {
    release(json(populatedList));
  });
  available = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(history.location.href).toBe('/voc-clusters');
});
it('does not reconcile a preserved selected param during automatic availability fallback', async () => {
  const { client, history } = mount();
  await enter();
  const href = history.location.href;
  listRead = async () => json({ items: [] });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-clusters'] });
  });
  available = false;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['voc-cluster-suggestions'] });
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /^전체/ })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(history.location.href).toBe(href);
});
