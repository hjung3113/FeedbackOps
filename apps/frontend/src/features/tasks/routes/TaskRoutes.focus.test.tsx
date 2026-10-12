type ApiModule = typeof import('@/lib/api');
import { AppFrame } from '@/lib/layout/AppFrame';
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
const request2: TaskRequestDto = {
  ...request,
  id: '10000000-0000-0000-0000-000000000002',
  display_id: 'REQ-1072',
  requested_outcome: 'Review the second candidate',
};
const requests = [request, request2];
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
const task2: TaskDetailDto = {
  ...task,
  id: request2.id,
  display_id: 'TASK-1001',
  title: '정산 배치 실패 알림 정리',
  priority: 'medium',
};
const tasks = [task, task2];
vi.mock('@/lib/api', async (original) => ({
  ...(await original<ApiModule>()),
  fetchTaskRequests: vi.fn(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTaskRequestsQuerySchema.parse(raw);
    const scoped =
      !query.managed_system_id ||
      query.managed_system_id === 'all' ||
      query.managed_system_id === scope;
    if (query.limit === 1)
      return {
        items: scoped ? requests : [],
        page: { total: scoped ? requests.length : 0, has_more: false },
      };
    const items = scoped
      ? requests.filter((item) => !query.status || item.status === query.status)
      : [];
    return { items, page: { total: items.length, has_more: false } };
  }),
  getTaskRequest: vi.fn(async (id: string) => {
    const found = requests.find((item) => item.id === id);
    if (!found) throw new Error('Unexpected request ID');
    return found;
  }),
  listTasks: vi.fn(async ({ signal: _signal, ...raw } = {}) => {
    const query = listTasksQuerySchema.parse(raw);
    const items = tasks.filter(
      (item) =>
        (!query.managed_system_id ||
          query.managed_system_id === 'all' ||
          query.managed_system_id === scope) &&
        (!query.status || query.status === item.status) &&
        (!query.assignee || query.assignee === 'me' || query.assignee === item.assignee_actor_id),
    );
    return { items, page: { total: items.length, has_more: false } };
  }),
  getTask: vi.fn(async (id: string) => {
    const found = tasks.find((item) => item.id === id);
    if (!found) throw new Error('Unexpected Task ID');
    return found;
  }),
  resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
  fetchPermissionCheck: vi.fn(async () => ({ state: 'approved' })),
  // Extra reads the real AppFrame host performs (fullscreen cases).
  fetchCapabilityScope: vi.fn(async () => ({ scope: { kind: 'all' } })),
  fetchNavCounts: vi.fn(async () => ({ counts: {} })),
  fetchSavedViews: vi.fn(async () => ({ items: [] })),
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
function createTasksRouter(view: string, host: (children: React.ReactNode) => React.ReactNode) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: () => host(<TasksRouteView search={route.useSearch()} />),
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
  return { router, history };
}
function mount(view: 'requests' | 'backlog') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { router } = createTasksRouter(view, (children) => (
    <DetailPanelHost>{children}</DetailPanelHost>
  ));
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}
// Real fullscreen host (acceptance D/E): the real AppFrame renders <main hidden>
// while the panel is expanded, so the row is inside a [hidden] ancestor on close.
function mountWithFrame(view: 'backlog') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { router } = createTasksRouter(view, (children) => (
    <AppFrame
      activeDomain="tasks"
      sidebarEntries={[{ id: 'tasks-backlog', label: 'Tasks', href: '/tasks?view=backlog' }]}
    >
      {children}
    </AppFrame>
  ));
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}
async function settleQueries(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
function listRow(displayId: string) {
  const row = screen
    .getAllByRole('button')
    .find((element) => element.textContent?.includes(displayId));
  expect(row, `list row for ${displayId}`).toBeDefined();
  return row as HTMLElement;
}
afterEach(cleanup);
it.each([
  ['requests', 'click'],
  ['requests', 'keyboard'],
  ['backlog', 'click'],
  ['backlog', 'keyboard'],
] as const)(
  'returns focus to the selected %s row after closing the panel via %s',
  async (view, interaction) => {
    const mounted = mount(view);
    await screen.findByRole('heading', {
      name: view === 'requests' ? request.requested_outcome : task.title,
    });
    await settleQueries(mounted.client);
    const row = listRow(view === 'requests' ? 'REQ-1071' : 'TASK-1000');
    const focusInTargets: Array<Element | null> = [];
    const focusOutActive: Array<Element | null> = [];
    let closeButton: HTMLElement | null = null;
    let rowFocusCloseConnected: boolean | null = null;
    const onFocusIn = (event: FocusEvent) => {
      focusInTargets.push(event.target as Element | null);
      if (event.target === row && closeButton !== null) {
        rowFocusCloseConnected = closeButton.isConnected;
      }
    };
    const onFocusOut = () => focusOutActive.push(document.activeElement);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    try {
      const close = await screen.findByRole('button', { name: '패널 닫기' });
      closeButton = close;
      await act(async () => {
        close.focus();
      });
      expect(document.activeElement).toBe(close);
      if (interaction === 'keyboard') {
        // jsdom does not synthesize button activation from keyDown.
        fireEvent.keyDown(close, { key: 'Enter' });
      }
      fireEvent.click(close);
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: '패널 닫기' })).not.toBeInTheDocument();
        expect(mounted.router.state.location.search.param).toBeUndefined();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(row);
      expect(focusInTargets).toContain(row);
      // No focus event ever landed on `body`. (Sampling `document.activeElement` in
      // the `focusout` listener is not usable as an assertion in jsdom: `focus()`
      // clears `_lastFocusedElement` before dispatching blur/focusout, so the blur
      // of the close button always samples body even when focus lands directly on
      // the row; and the broken no-op close fires no focusout at all.)
      expect(focusInTargets).not.toContain(document.body);
      // Focus reached the row while the close button was still connected: the
      // close handler focuses the row synchronously, before the panel unmounts
      // the button, so focus never rests on `body` in between.
      expect(rowFocusCloseConnected).toBe(true);
    } finally {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    }
  },
);
// backlog has no equivalent state: the Task list has no tabs, so the selected row
// cannot leave the shown list the way a Task Request can on a status-tab switch.
it('does not focus a list row when the selected request is absent from the shown tab', async () => {
  const mounted = mount('requests');
  await screen.findByRole('heading', { name: request.requested_outcome });
  await settleQueries(mounted.client);
  // Radix tabs activate on mouseDown (see .claude/rules/frontend-tests.md). The
  // approved tab excludes the pending_review request, so its row unmounts.
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /^승인됨/ }));
  await screen.findByRole('heading', { name: request.requested_outcome });
  await settleQueries(mounted.client);
  // The loading state remounts the route; re-query the freshly rendered close button.
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
  expect(document.activeElement?.getAttribute('role')).not.toBe('button');
});
it('returns focus to the row after closing a fullscreen panel in the real AppFrame host', async () => {
  const mounted = mountWithFrame('backlog');
  await screen.findByRole('heading', { name: task.title });
  await settleQueries(mounted.client);
  const row = listRow('TASK-1000');
  // jsdom 25 lets focus land inside [hidden], so the final identity alone cannot
  // tell a synchronous focus of the hidden row from the real rAF retry. The row
  // must receive focus only after the retry saw it visible: pin the hidden state
  // of AppFrame's main at the moment the row is focused.
  let rowFocusMainHidden: boolean | null = null;
  const onFocusIn = (event: FocusEvent) => {
    if (event.target === row) rowFocusMainHidden = screen.getByTestId('app-main').hidden;
  };
  document.addEventListener('focusin', onFocusIn);
  try {
    fireEvent.click(await screen.findByRole('button', { name: '전체 화면 전환' }));
    expect(screen.getByTestId('app-main')).toHaveProperty('hidden', true);
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '패널 닫기' })).not.toBeInTheDocument();
      expect(screen.getByTestId('app-main')).toHaveProperty('hidden', false);
    });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(rowFocusMainHidden).toBe(false);
  } finally {
    document.removeEventListener('focusin', onFocusIn);
  }
});
it('cancels the pending focus return when another row is selected before a frame runs', async () => {
  const mounted = mountWithFrame('backlog');
  await screen.findByRole('heading', { name: task.title });
  await settleQueries(mounted.client);
  const firstRow = listRow('TASK-1000');
  fireEvent.click(await screen.findByRole('button', { name: '전체 화면 전환' }));
  expect(screen.getByTestId('app-main')).toHaveProperty('hidden', true);
  // Hold frames back so the pending return cannot fire between close and selection.
  const frames: Array<FrameRequestCallback> = [];
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  try {
    const close = await screen.findByRole('button', { name: '패널 닫기' });
    await act(async () => {
      fireEvent.click(close);
      await mounted.router.navigate({
        to: '/tasks',
        search: (previous: { param?: string }) => ({ ...previous, param: task2.id }),
      });
    });
    await screen.findByRole('heading', { name: task2.title });
    await act(async () => {
      const queued = frames.splice(0);
      for (const callback of queued) callback(performance.now());
      await Promise.resolve();
    });
    expect(screen.getByTestId('app-main')).toHaveProperty('hidden', false);
    expect(document.activeElement).not.toBe(firstRow);
  } finally {
    rafSpy.mockRestore();
  }
});
