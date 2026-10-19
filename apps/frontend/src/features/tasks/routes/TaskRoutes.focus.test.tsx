type ApiModule = typeof import('@/lib/api');
import * as api from '@/lib/api';
import * as areasApi from '@/lib/api/analytics-areas';
import * as milestonesApi from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import { AppFrame } from '@/lib/layout/AppFrame';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/routes/_authed/tasks';
import { taskRequestPage } from '@/test/task-request-pages';
import {
  type TaskDetailDto,
  type TaskRequestDto,
  listTaskRequestsQuerySchema,
  listTasksQuerySchema,
} from '@fops/shared';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { toast } from 'sonner';
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
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
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
  assignee_team_id: null,
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
function DetailPanelSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}
function DetailPanelHost({ children }: { children: React.ReactNode }) {
  return (
    <DetailPanelSlotProvider>
      {children}
      <DetailPanelSlotHost />
    </DetailPanelSlotProvider>
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
// Keyboard rows removed (owner decision 60-2): fireEvent.keyDown + click does not
// prove native keyboard activation in jsdom.
it.each(['requests', 'backlog'] as const)(
  'returns focus to the selected %s row after closing the panel',
  async (view) => {
    const mounted = mount(view);
    await screen.findByRole('heading', {
      name: view === 'requests' ? request.requested_outcome : task.title,
    });
    await settleQueries(mounted.client);
    const row = listRow(view === 'requests' ? 'REQ-1071' : 'TASK-1000');
    const focusInTargets: Array<Element | null> = [];
    let closeButton: HTMLElement | null = null;
    let rowFocusCloseConnected: boolean | null = null;
    const onFocusIn = (event: FocusEvent) => {
      focusInTargets.push(event.target as Element | null);
      if (event.target === row && closeButton !== null) {
        rowFocusCloseConnected = closeButton.isConnected;
      }
    };
    document.addEventListener('focusin', onFocusIn);
    try {
      const close = await screen.findByRole('button', { name: '패널 닫기' });
      closeButton = close;
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

it.each(['approved', 'rejected'] as const)(
  'preserves %s focus through a delayed current-tab refetch in the real AppFrame',
  async (status) => {
    const user = userEvent.setup();
    const result: TaskRequestDto = { ...request, status, decision_reason: '검토 완료' };
    let resolvePage!: (value: Awaited<ReturnType<typeof api.fetchTaskRequests>>) => void;
    const originalFetch = api.fetchTaskRequests;
    const fetch = vi.spyOn(api, 'fetchTaskRequests').mockImplementation((query) =>
      query?.status === 'pending_review' && mutation.mock.calls.length > 0
        ? new Promise((resolve) => {
            resolvePage = resolve;
          })
        : originalFetch(query),
    );
    const mutation = vi
      .spyOn(api, status === 'approved' ? 'approveTaskRequest' : 'rejectTaskRequest')
      .mockResolvedValue(result);
    const areas = vi
      .spyOn(areasApi, 'fetchAnalyticsAreas')
      .mockResolvedValue({ items: [], total: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { router } = createTasksRouter('requests', (children) => (
      <AppFrame
        activeDomain="tasks"
        sidebarEntries={[{ id: 'requests', label: 'Task Requests', href: '/tasks?view=requests' }]}
      >
        {children}
      </AppFrame>
    ));
    try {
      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      await screen.findByRole('heading', { name: '검토 결정' });
      const action = status === 'approved' ? '승인' : '반려';
      await user.click(screen.getByRole('button', { name: action }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByRole('textbox'), '검토 완료');
      await user.click(within(dialog).getByRole('button', { name: action }));
      const nextRow = await screen.findByRole('button', { name: new RegExp(request2.display_id) });
      await waitFor(() => expect(nextRow).toHaveFocus());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(document.activeElement).toBe(nextRow);
      await act(async () => resolvePage(taskRequestPage([request2])));
      expect(document.activeElement).toBe(nextRow);
      expect(router.state.location.search.param).toBe(request2.id);
    } finally {
      cleanup();
      client.clear();
      fetch.mockRestore();
      mutation.mockRestore();
      areas.mockRestore();
    }
  },
);

it.each(
  (['approved', 'rejected'] as const).flatMap((status) =>
    [false, true].map((expanded) => ({ status, expanded })),
  ),
)(
  'keeps the sole needs-more-evidence dialog connected until confirmed empty after $status expanded=$expanded',
  async ({ status, expanded }) => {
    const row = { ...request, status: 'needs_more_evidence' as const };
    let release!: (value: Awaited<ReturnType<typeof api.fetchTaskRequests>>) => void;
    let decided = false;
    const fetch = vi.spyOn(api, 'fetchTaskRequests').mockImplementation(async (query) => {
      if (query?.limit === 1) return taskRequestPage([row]);
      if (decided)
        return new Promise((resolve) => {
          release = resolve;
        });
      return taskRequestPage(query?.status === row.status ? [row] : [], query);
    });
    const detail = vi.spyOn(api, 'getTaskRequest').mockResolvedValue(row);
    const mutation = vi
      .spyOn(api, status === 'approved' ? 'approveTaskRequest' : 'rejectTaskRequest')
      .mockImplementation(async () => {
        decided = true;
        return { ...row, status };
      });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { router } = createTasksRouter('requests', (children) => (
      <AppFrame activeDomain="tasks" sidebarEntries={[]}>
        {children}
      </AppFrame>
    ));
    const disconnectedFocus: Element[] = [];
    let dialog: HTMLElement | undefined;
    let hiddenAtHeadingFocus: boolean | undefined;
    const observer = new MutationObserver(() => {
      if (dialog && !dialog.isConnected && document.activeElement)
        disconnectedFocus.push(document.activeElement);
    });
    const recordFocus = (event: FocusEvent) => {
      if ((event.target as HTMLElement).textContent === '현재 조건에 맞는 Task Request가 없습니다')
        hiddenAtHeadingFocus = screen.getByTestId('app-main').hidden;
    };
    document.addEventListener('focusin', recordFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      await screen.findByRole('heading', { name: '검토 결정' });
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /^근거 추가 필요/ })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      if (expanded) fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
      const action = status === 'approved' ? '승인' : '반려';
      fireEvent.click(screen.getByRole('button', { name: action }));
      dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
      fireEvent.click(within(dialog).getByRole('button', { name: action }));
      await waitFor(() => expect(router.state.location.search.param).toBeUndefined());
      expect(dialog.isConnected).toBe(true);
      expect(
        screen.queryByRole('heading', { name: '현재 조건에 맞는 Task Request가 없습니다' }),
      ).not.toBeInTheDocument();
      await act(async () => release(taskRequestPage([], { status: row.status })));
      const heading = await screen.findByRole('heading', {
        name: '현재 조건에 맞는 Task Request가 없습니다',
      });
      await waitFor(() => expect(heading).toHaveFocus());
      expect(heading).toHaveAttribute('tabindex', '-1');
      expect(dialog.isConnected).toBe(false);
      expect(hiddenAtHeadingFocus).toBe(false);
      expect(disconnectedFocus).not.toContain(document.body);
    } finally {
      observer.disconnect();
      document.removeEventListener('focusin', recordFocus);
      cleanup();
      client.clear();
      fetch.mockRestore();
      detail.mockRestore();
      mutation.mockRestore();
    }
  },
);

it('collapses an expanded decision panel before the next row receives focus', async () => {
  const mutation = vi
    .spyOn(api, 'approveTaskRequest')
    .mockResolvedValue({ ...request, status: 'approved' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { router } = createTasksRouter('requests', (children) => (
    <AppFrame activeDomain="tasks" sidebarEntries={[]}>
      {children}
    </AppFrame>
  ));
  let hiddenAtFocus: boolean | undefined;
  const record = (event: FocusEvent) => {
    if ((event.target as HTMLElement)?.dataset.requestId === request2.id)
      hiddenAtFocus = screen.getByTestId('app-main').hidden;
  };
  document.addEventListener('focusin', record);
  try {
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: '검토 결정' });
    fireEvent.click(screen.getByRole('button', { name: '전체 화면 전환' }));
    expect(screen.getByTestId('app-main')).toHaveProperty('hidden', true);
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() => expect(hiddenAtFocus).toBe(false));
    expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus();
  } finally {
    document.removeEventListener('focusin', record);
    cleanup();
    client.clear();
    mutation.mockRestore();
  }
});

it('keeps the sole URL-selected row connected through delayed refetch and remaining pages', async () => {
  let decided = false;
  let releasePage!: (value: Awaited<ReturnType<typeof api.fetchTaskRequests>>) => void;
  let releaseNext!: (value: Awaited<ReturnType<typeof api.fetchTaskRequests>>) => void;
  const fetch = vi.spyOn(api, 'fetchTaskRequests').mockImplementation(async (query) => {
    if (query?.limit === 1) return taskRequestPage(requests);
    if (query?.cursor)
      return new Promise((resolve) => {
        releaseNext = resolve;
      });
    if (decided)
      return new Promise((resolve) => {
        releasePage = resolve;
      });
    return { items: [request], page: { has_more: true, cursor: 'next-page', total: 2 } };
  });
  const mutation = vi.spyOn(api, 'approveTaskRequest').mockImplementation(async () => {
    decided = true;
    return { ...request, status: 'approved' };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { router } = createTasksRouter('requests', (children) => (
    <DetailPanelHost>{children}</DetailPanelHost>
  ));
  try {
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: '검토 결정' });
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
    await waitFor(() => expect(router.state.location.search.param).toBeUndefined());
    expect(dialog.isConnected).toBe(true);
    await act(async () =>
      releasePage({ items: [], page: { has_more: true, cursor: 'next-page', total: 1 } }),
    );
    await waitFor(() => expect(releaseNext).toBeTypeOf('function'));
    expect(dialog.isConnected).toBe(true);
    expect(screen.queryByText('검토 대기 중인 Task Request가 없습니다')).not.toBeInTheDocument();
    await act(async () => releaseNext(taskRequestPage([request2])));
    await waitFor(() => expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus());
    expect(router.state.location.search.param).toBe(request2.id);
    expect(dialog.isConnected).toBe(false);
  } finally {
    cleanup();
    client.clear();
    fetch.mockRestore();
    mutation.mockRestore();
  }
});

it.each(['refetch error', 'focus refusal'] as const)(
  'bounds decision focus work after %s and retains connected content',
  async (failure) => {
    let decided = false;
    let recovered = false;
    let failPage!: (error: Error) => void;
    const fetch = vi.spyOn(api, 'fetchTaskRequests').mockImplementation(async (query) => {
      if (query?.limit === 1) return taskRequestPage(requests);
      if (!decided)
        return taskRequestPage(failure === 'refetch error' ? [request] : requests, query);
      if (recovered || failure === 'focus refusal') return taskRequestPage([request2], query);
      return new Promise((_resolve, reject) => {
        failPage = reject;
      });
    });
    const mutation = vi.spyOn(api, 'approveTaskRequest').mockImplementation(async () => {
      decided = true;
      return { ...request, status: 'approved' };
    });
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const { client } = mount('requests');
    let focus: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await screen.findByRole('heading', { name: '검토 결정' });
      await settleQueries(client);
      if (failure === 'focus refusal') {
        const target = screen.getByRole('button', { name: /REQ-1072/ });
        focus = vi.spyOn(target, 'focus').mockImplementation(() => {});
      }
      fireEvent.click(screen.getByRole('button', { name: '승인' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '검토 완료' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '승인' }));
      if (failure === 'refetch error') {
        await waitFor(() => expect(failPage).toBeTypeOf('function'));
        await act(async () =>
          failPage(
            new ApiError(500, { code: 'internal.unexpected', message: 'temporary failure' }),
          ),
        );
        await within(dialog).findByRole('button', { name: '다시 시도' });
      } else {
        await waitFor(() => expect(focus).toHaveBeenCalled());
      }
      await settleQueries(client);
      const attemptsBeforeFrames = focus?.mock.calls.length ?? 0;
      for (let frame = 0; frame < 50; frame++) {
        await act(async () => {
          const pending = [...frames.values()];
          frames.clear();
          for (const callback of pending) callback(frame * 16);
        });
      }
      expect(frames.size).toBe(0);
      if (focus) {
        expect(focus.mock.calls.length).toBeGreaterThan(0);
        expect(focus.mock.calls.length - attemptsBeforeFrames).toBeLessThanOrEqual(10);
      }
      expect(dialog.isConnected).toBe(true);
      expect(within(dialog).getByRole('textbox')).toHaveValue('검토 완료');
      if (failure === 'refetch error') {
        const retry = within(dialog).getByRole('button', { name: '다시 시도' });
        expect(retry).toBeVisible();
        recovered = true;
        fireEvent.click(retry);
        await waitFor(() => expect(screen.getByRole('button', { name: /REQ-1072/ })).toHaveFocus());
        expect(dialog.isConnected).toBe(false);
      }
    } finally {
      focus?.mockRestore();
      cleanup();
      client.clear();
      raf.mockRestore();
      cancel.mockRestore();
      fetch.mockRestore();
      mutation.mockRestore();
    }
  },
);

it('opens the converted Task from the persistent toast action through the real router', async () => {
  const row = { ...request, status: 'approved' as const, source_type: 'voc' as const };
  const fetch = vi
    .spyOn(api, 'fetchTaskRequests')
    .mockImplementation(async (query) => taskRequestPage([row], query));
  const detail = vi.spyOn(api, 'getTaskRequest').mockResolvedValue(row);
  const areas = vi
    .spyOn(areasApi, 'fetchAnalyticsAreas')
    .mockResolvedValue({ items: [], total: 0 });
  const milestones = vi.spyOn(milestonesApi, 'listMilestones').mockResolvedValue({ items: [] });
  const conversion = vi
    .spyOn(api, 'convertTaskRequest')
    .mockResolvedValue({ ...task, assignee_actor_id: null });
  const success = vi.spyOn(toast, 'success');
  const mounted = mount('requests');
  try {
    fireEvent.click(await screen.findByRole('button', { name: 'Task로 전환' }));
    const submit = await screen.findByTestId('task-request-convert-submit');
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(success).toHaveBeenCalled());
    const options = success.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      duration: Number.POSITIVE_INFINITY,
      action: { label: 'Task 열기' },
    });
    const action = options?.action;
    if (!action || typeof action !== 'object' || !('onClick' in action))
      throw new Error('Expected a toast action');
    const toastAction = render(
      <button type="button" onClick={action.onClick}>
        Task 열기
      </button>,
    );
    fireEvent.click(toastAction.getByRole('button', { name: 'Task 열기' }));
    await waitFor(() =>
      expect(mounted.router.state.location.search).toMatchObject({
        view: 'backlog',
        param: task.id,
      }),
    );
  } finally {
    cleanup();
    mounted.client.clear();
    fetch.mockRestore();
    detail.mockRestore();
    areas.mockRestore();
    milestones.mockRestore();
    conversion.mockRestore();
    success.mockRestore();
  }
});
