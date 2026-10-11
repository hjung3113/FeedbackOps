import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import {
  type TaskDetailDto,
  type TaskRequestDto,
  listTaskRequestsQuerySchema,
  listTasksQuerySchema,
} from '@fops/shared';
import { DetailPanelSlotContext } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const scope = '30000000-0000-0000-0000-000000000003';
const requester = '20000000-0000-0000-0000-000000000002';
// Fixtures from TaskRequestsRoute.decision.test.tsx and TaskListRoute.test.tsx.
const request: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-1071',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: scope,
  evidence_summary: 'Evidence summary',
  requested_outcome: 'Review the candidate task',
  requester_actor_id: requester,
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const task: TaskDetailDto = {
  id: request.id,
  workspace_id: request.workspace_id,
  display_id: 'TASK-1000',
  primary_managed_system_id: scope,
  title: '매출 리포트 쿼리 플랜 개선',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: requester,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: requester,
  created_at: request.created_at,
  updated_at: request.updated_at,
  source: {
    finding: {
      id: request.source_id,
      display_id: 'FIN-179',
      title: '리포트 속도 저하',
      summary: '쿼리 플랜 개선 필요',
      evidence_count: 3,
    },
  },
};
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  fetchTaskRequests: vi.fn(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTaskRequestsQuerySchema.parse(raw);
    const scoped =
      !query.managed_system_id ||
      query.managed_system_id === 'all' ||
      query.managed_system_id === scope;
    if (query.limit === 1)
      return { items: scoped ? [request] : [], page: { total: scoped ? 1 : 0, has_more: false } };
    const items = scoped && (!query.status || query.status === request.status) ? [request] : [];
    return { items, page: { total: items.length, has_more: false } };
  }),
  getTaskRequest: vi.fn(async (id: string) => {
    if (id !== request.id) throw new Error('Unexpected request ID');
    return request;
  }),
  listTasks: vi.fn(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTasksQuerySchema.parse(raw);
    const items =
      (!query.managed_system_id ||
        query.managed_system_id === 'all' ||
        query.managed_system_id === scope) &&
      (!query.status || query.status === task.status) &&
      (!query.assignee || query.assignee === 'me' || query.assignee === task.assignee_actor_id)
        ? [task]
        : [];
    return { items, page: { total: items.length, has_more: false } };
  }),
  getTask: vi.fn(async (id: string) => {
    if (id !== task.id) throw new Error('Unexpected Task ID');
    return task;
  }),
  resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
  fetchPermissionCheck: vi.fn(async () => ({ state: 'approved' })),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: requester, role_level: 'admin' } } }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/managed-systems', () => ({
  fetchManagedSystems: async () => ({ items: [{ id: scope, name: 'Billing Ops' }] }),
}));
vi.mock('@/features/findings/public', () => ({ useFindingDetail: () => ({ data: null }) }));
vi.mock('@/lib/api/entity-links', () => ({
  fetchTaskRequestEntityLinks: async () => ({ items: [] }),
}));
vi.mock('@/lib/api/tasks-comments', async (original) => ({
  ...(await original<typeof import('@/lib/api/tasks-comments')>()),
  listTaskComments: async () => ({ items: [], page: { has_more: false } }),
}));
// The real ListShell registers the real panel in the same slot contract as AppFrame.
function DetailPanelHost({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = React.useState<React.ReactNode>();
  const setContent = React.useCallback((_key: string, node: React.ReactNode) => setPanel(node), []);
  const clear = React.useCallback(() => setPanel(undefined), []);
  const context = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);
  return (
    <DetailPanelSlotContext.Provider value={context}>
      {children}
      {panel}
    </DetailPanelSlotContext.Provider>
  );
}
function mount(view: 'requests' | 'backlog') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: () => (
      <DetailPanelHost>
        <TasksRouteView search={route.useSearch()} />
      </DetailPanelHost>
    ),
  });
  const history = createMemoryHistory({
    initialEntries: [`/tasks?view=${view}&managedSystem=${scope}&param=${request.id}`],
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router, history };
}
afterEach(cleanup);
it.each(['requests', 'backlog'] as const)(
  'measures focus after closing the real %s panel',
  async (view) => {
    const mounted = mount(view);
    await screen.findByRole('heading', {
      name: view === 'requests' ? request.requested_outcome : task.title,
    });
    await waitFor(() => expect(mounted.client.isFetching()).toBe(0));
    const close = await screen.findByRole('button', { name: '패널 닫기' });
    await act(async () => {
      close.focus();
    });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '패널 닫기' })).not.toBeInTheDocument();
      expect(mounted.router.state.location.search.param).toBeUndefined();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const active = document.activeElement;
    console.info(
      `W-1022 focus after ${view} close: ${JSON.stringify({ tag: active?.tagName, role: active?.getAttribute('role'), ariaLabel: active?.getAttribute('aria-label'), isBody: active === document.body })}`,
    );
  },
);
