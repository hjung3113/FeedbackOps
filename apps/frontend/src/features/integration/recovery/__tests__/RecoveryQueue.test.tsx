import { validateHomeSearch } from '@/routes/_authed/home';
import { validateIntegrationDashboardSearch } from '@/routes/_authed/integration';
import { DetailPanelFullscreenContext, DetailPanelSlotContext, PageShell } from '@fops/ui';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useMemo, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRecoveryQueue } from '../useRecoveryQueue';

const ID = 'r1_abcdefghijklmnopqrstuvw';
const SECOND = 'r1_bbcdefghijklmnopqrstuvw';
const SOURCE = '11111111-1111-4111-8111-111111111111';
const item = {
  recovery_item_id: ID,
  category: 'unassigned-voc',
  state: 'active',
  occurrence: 1,
  presentation: { state: 'visible', snoozed_until: null },
  resolution: null,
  reason_code: 'unassigned-voc',
  reason: 'VOC 담당자 배정이 필요합니다.',
  priority: 1,
  severity: 'warn',
  managed_system_id: SOURCE,
  source: {
    type: 'voc',
    id: SOURCE,
    display_id: 'VOC-1',
    title: '다운로드 오류',
    route: `/vocs?selected=${SOURCE}`,
  },
  affected: [],
  next_actions: [],
  responsible_actor_hint: { kind: 'unassigned', label: '담당자 없음' },
};
const time = '2026-07-20T00:00:00.000Z';
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function setup(
  options: {
    detail?: () => Response | Promise<Response>;
    history?: () => Response;
    list?: (url: URL) => Response | Promise<Response>;
    patch?: (body: unknown) => Response | Promise<Response>;
  } = {},
) {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      if (method === 'GET' && url.pathname === '/me')
        return response({ actor: { id: SOURCE, role_level: 'admin' }, workspace_id: SOURCE });
      if (
        method === 'PATCH' &&
        [ID, SECOND].some((id) => url.pathname === `/dashboard/recovery-items/${id}/presentation`)
      )
        return options.patch?.(body) ?? response({ ...item, computed_at: time });
      if (method === 'GET' && url.pathname === '/dashboard/recovery-history')
        return (
          options.history?.() ??
          response({
            computed_at: time,
            window_start: '2026-05-01T00:00:00.000Z',
            total: 1,
            page: { has_more: false },
            items: [
              {
                id: SOURCE,
                item,
                occurrence: 2,
                resolution: {
                  resolved_at: time,
                  outcome: 'resolved',
                  evidence: 'command',
                  action: 'triage',
                },
              },
            ],
          })
        );
      if (method === 'GET' && url.pathname === '/dashboard/recovery-items')
        return (
          options.list?.(url) ??
          response({
            computed_at: time,
            items: [item, { ...item, recovery_item_id: SECOND, reason: '다른 VOC 담당자 배정' }],
            total: 2,
            visible_total: 2,
            hidden_total: 0,
            page: { has_more: false },
          })
        );
      if (
        method !== 'GET' ||
        ![ID, SECOND].some((id) => url.pathname === `/dashboard/recovery-items/${id}`)
      )
        throw new Error(`Unexpected request: ${method} ${url.pathname}`);
      return (
        options.detail?.() ??
        response({ ...item, recovery_item_id: url.pathname.split('/').at(-1), computed_at: time })
      );
    }),
  );
  return requests;
}
function Host() {
  const [panel, setPanel] = useState<ReactNode>();
  const ctx = useMemo(
    () => ({
      setContent: (_key: string, node: ReactNode) => setPanel(node),
      clear: () => setPanel(undefined),
    }),
    [],
  );
  return (
    <DetailPanelSlotContext.Provider value={ctx}>
      <Outlet />
      <aside>{panel}</aside>
    </DetailPanelSlotContext.Provider>
  );
}
function Queue({ view = 'operational' }: { view?: 'operational' | 'actionable' }) {
  const recovery = useRecoveryQueue(view);
  return <PageShell detailPanel={recovery.detailPanel}>{recovery.queue}</PageShell>;
}
async function mount(url = '/integration', fullscreen = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: Host });
  const integration = createRoute({
    getParentRoute: () => root,
    path: '/integration',
    validateSearch: validateIntegrationDashboardSearch,
    component: Queue,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    validateSearch: validateHomeSearch,
    component: () => <Queue view="actionable" />,
  });
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({ history, routeTree: root.addChildren([integration, home]) });
  await act(async () => router.load());
  const view = render(
    <QueryClientProvider client={client}>
      <DetailPanelFullscreenContext.Provider value={{ expanded: fullscreen, toggle: () => {} }}>
        <RouterProvider router={router} />
      </DetailPanelFullscreenContext.Provider>
    </QueryClientProvider>,
  );
  return { client, router, history, ...view };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});
it('restores independent detail on refresh and Back; keyboard close returns focus through the real slot', async () => {
  setup();
  const { router, history, unmount } = await mount();
  const row = await screen.findByRole('button', { name: /VOC 담당자 배정이 필요/ });
  row.focus();
  fireEvent.keyDown(row, { key: 'Enter' });
  await screen.findByTestId('recovery-panel');
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
  const saved = router.state.location.href;
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByTestId('recovery-panel')).toBeNull());
  expect(row).toHaveFocus();
  await act(async () => history.back());
  await screen.findByTestId('recovery-panel');
  unmount();
  await mount(saved);
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
});
it.each([
  ['내 화면에서 1일 숨기기', { action: 'snooze', days: 1 }],
  ['내 화면에서 7일 숨기기', { action: 'snooze', days: 7 }],
  ['내 화면에서 이번 항목 숨기기', { action: 'mute' }],
] as const)(
  'pins %s and invalidates all personal variants, detail/history',
  async (label, body) => {
    const requests = setup();
    const { client } = await mount(`/integration?selected=${ID}`);
    client.setQueryData(['recovery', 'other-personal-list'], { items: [] });
    client.setQueryData(['recovery', 'history', 'inactive'], { items: [] });
    client.setQueryData(['voc', 'source'], { title: 'before' });
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() =>
      expect(requests.filter((r) => r.method === 'PATCH').map((r) => r.body)).toEqual([body]),
    );
    await waitFor(() =>
      expect(client.getQueryState(['recovery', 'other-personal-list'])?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(['recovery', 'history', 'inactive'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['voc', 'source'])?.isInvalidated).toBe(true);
  },
);
it('shows history outer occurrence/resolution and omits list-only query selectors on Home', async () => {
  const requests = setup();
  await mount('/home?history=true');
  await screen.findByText('2회차 · 해결됨');
  expect(
    requests
      .filter((r) => r.url.pathname === '/dashboard/recovery-history')
      .map((r) => Object.fromEntries(r.url.searchParams)),
  ).toEqual([{ limit: '50' }]);
  fireEvent.click(screen.getByRole('button', { name: /VOC 담당자 배정이 필요/ }));
  await screen.findByTestId('recovery-panel');
});
it.each(['operational', 'actionable'] as const)(
  'requests %s without changing summary semantics',
  async (view) => {
    const requests = setup();
    await mount(view === 'actionable' ? '/home' : '/integration');
    await screen.findByRole('button', { name: /VOC 담당자 배정이 필요/ });
    expect(
      requests
        .find((r) => r.url.pathname === '/dashboard/recovery-items')
        ?.url.searchParams.get('view'),
    ).toBe(view);
  },
);
it('keeps readable resolved selection with no stale repair or hiding action', async () => {
  setup({
    detail: () =>
      response({
        ...item,
        state: 'resolved',
        computed_at: time,
        resolution: {
          resolved_at: time,
          outcome: 'resolved',
          evidence: 'observation',
          action: null,
        },
      }),
  });
  await mount(`/integration?selected=${ID}`);
  await screen.findByText('해결됨');
  expect(screen.queryByRole('button', { name: '내 화면에서 1일 숨기기' })).toBeNull();
});
it('reconciles stale presentation conflict with a fresh resolved read', async () => {
  let resolved = false;
  setup({
    patch: () => {
      resolved = true;
      return response({ code: 'conflict.stale_write' }, 409);
    },
    detail: () =>
      response({
        ...item,
        computed_at: time,
        state: resolved ? 'resolved' : 'active',
        resolution: resolved
          ? { resolved_at: time, outcome: 'resolved', evidence: 'command', action: 'triage' }
          : null,
      }),
  });
  await mount(`/integration?selected=${ID}`);
  fireEvent.click(await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' }));
  await screen.findByText('해결됨');
  expect(screen.queryByRole('button', { name: '내 화면에서 1일 숨기기' })).toBeNull();
});
it.each([403, 404, 500])(
  'retains URL selection on detail %s and hides stale source data',
  async (status) => {
    setup({
      detail: () =>
        response({ code: status === 404 ? 'not_found.record' : 'permission.denied' }, status),
    });
    const { router } = await mount(`/integration?selected=${ID}`);
    await screen.findByText(
      status === 404
        ? '선택한 항목을 찾을 수 없습니다.'
        : status === 403
          ? '이 항목을 볼 권한이 없습니다.'
          : '항목을 불러오지 못했습니다.',
    );
    expect(router.state.location.search.selected).toBe(ID);
    expect(screen.queryByRole('link', { name: /다운로드 오류/ })).toBeNull();
  },
);
it('late PATCH does not overwrite a newer selection', async () => {
  let settle!: (r: Response) => void;
  setup({
    patch: () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  });
  const { router } = await mount(`/integration?selected=${ID}`);
  fireEvent.click(await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' }));
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: /다른 VOC/ }));
  await waitFor(() => expect(router.state.location.search.selected).toBe(SECOND));
  await act(async () => settle(response({ ...item, computed_at: time })));
  expect(router.state.location.search.selected).toBe(SECOND);
});

it('resets cursor when switching personal views and restores hidden items with the exact body', async () => {
  const requests = setup({
    detail: () =>
      response({
        ...item,
        computed_at: time,
        presentation: { state: 'muted', snoozed_until: null },
      }),
  });
  const { router } = await mount(`/integration?cursor=old&selected=${ID}`);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: '내 화면에서 숨긴 항목' }), {
    button: 0,
    ctrlKey: false,
  });
  await waitFor(() => expect(router.state.location.search.presentation).toBe('hidden'));
  expect(router.state.location.search.cursor).toBeUndefined();
  fireEvent.click(await screen.findByRole('button', { name: '내 화면에 다시 표시' }));
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'PATCH').map((r) => r.body)).toEqual([
      { action: 'restore' },
    ]),
  );
});
it('keeps loading distinct from empty and uses heading fallback if the origin row disappears', async () => {
  let settle!: (r: Response) => void;
  let hidden = false;
  setup({
    list: () =>
      hidden
        ? response({
            computed_at: time,
            items: [],
            total: 0,
            visible_total: 0,
            hidden_total: 1,
            page: { has_more: false },
          })
        : new Promise((resolve) => {
            settle = resolve;
          }),
  });
  const { client } = await mount();
  await screen.findByRole('status', { name: '항목 확인 중…' });
  expect(screen.queryByText('현재 표시할 항목이 없습니다.')).toBeNull();
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  await act(async () =>
    settle(
      response({
        computed_at: time,
        items: [item],
        total: 1,
        visible_total: 1,
        hidden_total: 0,
        page: { has_more: false },
      }),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: /VOC 담당자 배정이 필요/ }));
  await screen.findByRole('button', { name: '패널 닫기' });
  hidden = true;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['recovery', 'list'] });
  });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(screen.queryByTestId('recovery-panel')).toBeNull());
  // Focus return retries across animation frames until the shell reveals the target.
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '처리가 필요한 항목', level: 2 })).toHaveFocus(),
  );
});
it('respects nested overlay and defaultPrevented Escape', async () => {
  setup();
  await mount(`/integration?selected=${ID}`);
  await screen.findByRole('button', { name: '패널 닫기' });
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  document.body.append(overlay);
  fireEvent.keyDown(overlay, { key: 'Escape' });
  expect(screen.getByTestId('recovery-panel')).toBeVisible();
  overlay.remove();
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  event.preventDefault();
  document.dispatchEvent(event);
  expect(screen.getByTestId('recovery-panel')).toBeVisible();
});

it('rechecks selected detail in a changed scope and drops incompatible cursors without taking late PATCH focus', async () => {
  let settle!: (r: Response) => void;
  const requests = setup({
    patch: () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  });
  const { router } = await mount(`/integration?selected=${ID}&cursor=old`);
  fireEvent.click(await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' }));
  await waitFor(() => expect(settle).toBeTypeOf('function'));
  const marker = document.createElement('button');
  document.body.append(marker);
  marker.focus();
  await act(async () =>
    router.navigate({
      to: '/integration',
      search: { selected: ID, managedSystem: SOURCE },
    }),
  );
  await waitFor(() => expect(router.state.location.search.cursor).toBeUndefined());
  await act(async () => settle(response({ ...item, computed_at: time })));
  expect(router.state.location.search.managedSystem).toBe(SOURCE);
  expect(router.state.location.search.selected).toBe(ID);
  expect(marker).toHaveFocus();
  marker.remove();
  expect(
    requests.filter((r) => r.url.pathname === `/dashboard/recovery-items/${ID}`).length,
  ).toBeGreaterThan(1);
});
it.each([403, 500])('separates list %s from an empty queue', async (status) => {
  setup({
    list: () =>
      response({ code: status === 403 ? 'permission.denied' : 'internal.unexpected' }, status),
  });
  await mount();
  await screen.findByText(
    status === 403 ? '이 목록을 볼 권한이 없습니다.' : '항목을 불러오지 못했습니다.',
  );
  expect(screen.queryByText('현재 표시할 항목이 없습니다.')).toBeNull();
});
it('renders backend blocked action reasons without executing endpoint metadata', async () => {
  const requests = setup({
    detail: () =>
      response({
        ...item,
        computed_at: time,
        next_actions: [
          {
            id: 'triage',
            label: 'VOC 배정',
            availability: 'blocked_not_requestable',
            blocked_reason: '현재 권한으로 배정할 수 없습니다.',
            requestable_permission: null,
            target: {
              source_type: 'voc',
              source_id: SOURCE,
              route: `/vocs?selected=${SOURCE}`,
              endpoint: `/vocs/${SOURCE}`,
              method: 'PATCH',
              intent: 'triage',
            },
            confirmation: {
              required: false,
              title: '',
              body: '',
              risk_level: 'low',
              reason_required: false,
              audit_event_intent: null,
            },
          },
        ],
      }),
  });
  await mount(`/integration?selected=${ID}`);
  await screen.findByText('현재 권한으로 배정할 수 없습니다.');
  expect(screen.queryByRole('link', { name: 'VOC 배정' })).toBeNull();
  await act(async () => {
    await Promise.resolve();
  });
  expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
});

it('returns focus to the clicked history occurrence when the same identity appears twice', async () => {
  setup({
    history: () =>
      response({
        computed_at: time,
        window_start: '2026-05-01T00:00:00.000Z',
        total: 2,
        page: { has_more: false },
        items: [1, 2].map((occurrence) => ({
          id: occurrence === 1 ? SOURCE : '11111111-1111-4111-8111-111111111112',
          item,
          occurrence,
          resolution: {
            resolved_at: time,
            outcome: 'resolved',
            evidence: 'command',
            action: 'triage',
          },
        })),
      }),
  });
  await mount('/integration?history=true');
  const rows = await screen.findAllByRole('button', { name: /VOC 담당자 배정이 필요/ });
  const firstRow = rows[0];
  if (!firstRow) throw new Error('missing first history occurrence');
  fireEvent.click(firstRow);
  await screen.findByTestId('recovery-panel');
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByTestId('recovery-panel')).toBeNull());
  await waitFor(() => expect(rows[0]).toHaveFocus());
});

it('leaves fullscreen Escape to the shell and permits explicit close', async () => {
  setup();
  await mount(`/integration?selected=${ID}`, true);
  await screen.findByTestId('recovery-panel');
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.getByTestId('recovery-panel')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(screen.queryByTestId('recovery-panel')).toBeNull());
});
it('appends a bounded continuation without dropping loaded rows or selected detail', async () => {
  const requests = setup({
    list: (url) =>
      response({
        computed_at: time,
        items: url.searchParams.has('cursor')
          ? [{ ...item, recovery_item_id: SECOND, reason: '다른 VOC 담당자 배정' }]
          : [item],
        total: 2,
        visible_total: 2,
        hidden_total: 0,
        page: url.searchParams.has('cursor')
          ? { has_more: false }
          : { has_more: true, cursor: 'continuation' },
      }),
  });
  await mount(`/integration?selected=${ID}`);
  await screen.findByTestId('recovery-panel');
  fireEvent.click(await screen.findByRole('button', { name: '더 불러오기' }));
  await screen.findByRole('button', { name: /다른 VOC 담당자 배정/ });
  expect(screen.getByRole('button', { name: /VOC 담당자 배정이 필요/ })).toBeVisible();
  expect(screen.getByTestId('recovery-panel')).toBeVisible();
  expect(
    requests
      .filter((r) => r.url.pathname === '/dashboard/recovery-items')
      .map((r) => Object.fromEntries(r.url.searchParams)),
  ).toEqual([
    { view: 'operational', presentation: 'visible', limit: '50' },
    { view: 'operational', presentation: 'visible', limit: '50', cursor: 'continuation' },
  ]);
  expect(screen.queryByRole('button', { name: '더 불러오기' })).toBeNull();
});

it('restores a non-first-page cursor with its filter on Back and Forward', async () => {
  setup();
  const { router, history } = await mount('/integration?category=unassigned-voc&cursor=page-two');
  await screen.findByRole('button', { name: /VOC 담당자 배정이 필요/ });
  fireEvent.mouseDown(screen.getByRole('tab', { name: '내 화면에서 숨긴 항목' }), {
    button: 0,
    ctrlKey: false,
  });
  await waitFor(() => expect(router.state.location.search.cursor).toBeUndefined());
  await act(async () => history.back());
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      category: 'unassigned-voc',
      cursor: 'page-two',
    }),
  );
  await act(async () => history.forward());
  await waitFor(() => expect(router.state.location.search.presentation).toBe('hidden'));
  expect(router.state.location.search.cursor).toBeUndefined();
  await act(async () => history.back());
  await waitFor(() => expect(router.state.location.search.cursor).toBe('page-two'));
});

it.each([false, true])(
  'keeps recovery reads fresh across rapid remount and window focus, with history=%s',
  async (historyView) => {
    const requests = setup();
    const { router, client } = await mount(
      `/integration?selected=${ID}${historyView ? '&history=true' : ''}`,
    );
    await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
    await act(async () =>
      router.navigate({ to: '/home', search: historyView ? { history: true } : {} }),
    );
    await screen.findByRole('heading', { name: '내가 처리할 수 있는 항목' });
    const reads = () => requests.filter((r) => r.url.pathname.startsWith('/dashboard/recovery-'));
    const before = reads().length;
    await act(async () =>
      router.navigate({
        to: '/integration',
        search: { selected: ID, ...(historyView ? { history: true } : {}) },
      }),
    );
    await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
    expect(reads()).toHaveLength(before);
    await act(async () =>
      client.invalidateQueries({ queryKey: ['recovery'], refetchType: 'none' }),
    );
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(reads()).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await waitFor(() => expect(reads().length).toBeGreaterThan(before));
    focusManager.setFocused(undefined);
  },
);

it.each([
  ['muted', null, '이번 항목 숨김'],
  ['snoozed', '2026-07-21T15:28:00.123456Z', '내 화면에서 숨김 · 2026-07-21 15:28:00 UTC까지'],
] as const)(
  'shows %s personal state on the hidden row and named detail',
  async (state, until, label) => {
    const hidden = { ...item, presentation: { state, snoozed_until: until } };
    setup({
      list: () =>
        response({
          computed_at: time,
          items: [hidden],
          total: 1,
          visible_total: 0,
          hidden_total: 1,
          page: { has_more: false },
        }),
      detail: () => response({ ...hidden, computed_at: time }),
    });
    await mount(`/integration?presentation=hidden&selected=${ID}`);
    await screen.findByRole('button', { name: '내 화면에 다시 표시' });
    expect(screen.getByRole('heading', { name: '다운로드 오류' })).toBeVisible();
    expect(screen.getAllByText(label, { exact: false })).toHaveLength(2);
  },
);

it.each([
  ['presentation=hidden', '내 화면에서 숨긴 항목이 없습니다.'],
  ['history=true', '최근 3개월 처리 이력이 없습니다.'],
])('uses view-specific empty copy for %s', async (search, label) => {
  const empty = { computed_at: time, items: [], total: 0, page: { has_more: false } };
  setup({
    list: () => response({ ...empty, visible_total: 0, hidden_total: 0 }),
    history: () => response({ ...empty, window_start: '2026-05-01T00:00:00.000Z' }),
  });
  await mount(`/integration?${search}`);
  await screen.findByText(label);
});

it('formats microsecond resolution times and suppresses the hiding note on resolved detail', async () => {
  const resolution = {
    resolved_at: '2026-07-20T08:00:00.123456Z',
    outcome: 'resolved',
    evidence: 'command',
    action: 'triage',
  };
  setup({
    detail: () => response({ ...item, state: 'resolved', resolution, computed_at: time }),
    history: () =>
      response({
        computed_at: time,
        window_start: '2026-05-01T00:00:00.000Z',
        total: 1,
        page: { has_more: false },
        items: [{ id: SOURCE, item, occurrence: 1, resolution }],
      }),
  });
  await mount(`/integration?history=true&selected=${ID}`);
  await screen.findByText('해결됨');
  expect(screen.getAllByText(/2026-07-20 08:00:00 UTC/)).toHaveLength(2);
  expect(screen.getByText(/원본 화면에서 처리됨/)).toBeVisible();
  expect(screen.queryByText(/숨기기는 내 화면에만/)).toBeNull();
  expect(screen.queryByText(/123456/)).toBeNull();
});

it('scrolls the URL-selected row into view after the queue loads', async () => {
  setup();
  const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
  await mount(`/integration?selected=${SECOND}`);
  const row = await screen.findByRole('button', { name: /다른 VOC 담당자 배정/ });
  await waitFor(() => expect(scroll.mock.instances).toContain(row));
  scroll.mockRestore();
});

it('distinguishes Permission Request rows with the safe source identity and no empty separator', async () => {
  setup({
    list: () =>
      response({
        computed_at: time,
        items: [
          {
            ...item,
            category: 'permission-requests-pending',
            reason_code: 'permission-requests-pending',
            reason: 'Permission Request 검토가 필요합니다.',
            source: {
              type: 'permission_request',
              id: SOURCE,
              display_id: '',
              title: '요청자 이름',
              route: `/admin/permissions/requests?selected=${SOURCE}`,
            },
            responsible_actor_hint: { kind: 'admin_queue', label: 'Admin 검토 대기열' },
          },
        ],
        total: 1,
        visible_total: 1,
        hidden_total: 0,
        page: { has_more: false },
      }),
  });
  await mount();
  const row = await screen.findByRole('button', { name: /Permission Request 검토가 필요/ });
  expect(row).toHaveTextContent('요청자 이름 · Admin 검토 대기열');
  expect(row.textContent).not.toContain(SOURCE);
  expect(row.textContent).not.toContain('· Permission Request');
});

it('labels the Permission Request panel header with its domain noun and requester', async () => {
  setup({
    detail: () =>
      response({
        ...item,
        category: 'permission-requests-pending',
        reason_code: 'permission-requests-pending',
        source: {
          type: 'permission_request',
          id: SOURCE,
          display_id: '',
          title: '요청자 이름',
          route: `/admin/permissions/requests?selected=${SOURCE}`,
        },
        computed_at: time,
      }),
  });
  await mount(`/integration?selected=${ID}`);
  expect(
    await screen.findByRole('heading', { name: 'Permission Request · 요청자 이름' }),
  ).toBeVisible();
});
