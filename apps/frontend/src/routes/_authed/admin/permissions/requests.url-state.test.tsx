import { adminDetailFixture } from '@/test/permission-details';
// /admin/permissions/requests URL-state tests (issue #397).
//
// Tab + selection are URL state (docs/frontend/routes-and-layout.md §URL State
// Rules): ?tab=approved&selected=:requestId. `pending` is the default tab and
// omitted from the URL. Verifies restore-on-load, single-navigation tab
// changes with the keep/reselect rule, close removing selected, Back
// restoring the previous tab, and replace-reconciliation of a selection that
// is not visible in the active tab.
//
// Harness: createRoute + memory history with the route's own search schema
// (same pattern as __tests__/vocs.test.tsx and ./requests.test.tsx).

import type { PermissionRiskIndicator } from '@fops/shared';
import type * as FopsUi from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof FopsUi>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      tabs,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: string; subtitle?: string };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <header>
          <h2>{toolbar?.title}</h2>
          <span>{toolbar?.subtitle}</span>
        </header>
        {tabs}
        {list}
        {detailPanel}
      </div>
    ),
  };
});

import { PermissionRequestsConsolePage, permissionRequestsSearchSchema } from './requests';

const REQUESTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    requested_capability: 'workspace.read',
    requested_managed_system_id: null,
    revision: 7,
    requested_expiration: null,
    reason: 'need access',
    status: 'pending',
    created_at: '2026-07-17T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    requested_capability: 'workspace.write',
    requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    revision: 7,
    requested_expiration: null,
    reason: 'need detail',
    status: 'needs_more_info',
    created_at: '2026-07-16T00:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    requested_capability: 'workspace.admin',
    requested_managed_system_id: null,
    revision: 7,
    requested_expiration: null,
    reason: 'done',
    status: 'approved',
    created_at: '2026-07-15T00:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    requested_capability: 'workspace.delete',
    requested_managed_system_id: null,
    revision: 7,
    requested_expiration: null,
    reason: 'no',
    status: 'rejected',
    created_at: '2026-07-14T00:00:00.000Z',
  },
] as const;

const PENDING_ID = REQUESTS[0].id;
const APPROVED_ID = REQUESTS[2].id;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/permissions/requests',
    validateSearch: (raw) => permissionRequestsSearchSchema.parse(raw),
    component: PermissionRequestsConsolePage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { router, queryClient };
}

function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/me/permissions/check'))
      return response({ state: 'approved', decision: { allow: true } });
    if (url === '/me')
      return response({
        actor: {
          id: 'another-admin',
          external_id: 'admin',
          email: 'admin@example.test',
          display_name: 'Admin',
          role_level: 'admin',
        },
        workspace_id: 'workspace-1',
      });
    if (url === '/workspace/settings')
      return response({
        permission_self_approval: 'allowed',
        survey_anonymity_threshold: 5,
      });
    if (url === '/permissions/requests?status=all' && (!init?.method || init.method === 'GET')) {
      return response({ requests: REQUESTS, count: REQUESTS.length });
    }
    if (/^\/permissions\/requests\/[^/]+$/.test(url)) {
      const row = REQUESTS.find((candidate) => url.endsWith(candidate.id));
      if (row) return response(adminDetailFixture(row));
    }
    return response({ code: 'internal.unexpected', message: 'unmocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderUrlState(initialPath: string) {
  installFetch();
  const { router, queryClient } = buildHarness({ initialPath });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/admin/permissions/requests URL state', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('?tab=approved&selected=<approved id> restores tab and selection', async () => {
    const router = renderUrlState(
      `/admin/permissions/requests?tab=approved&selected=${APPROVED_ID}`,
    );
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /^승인됨\s*,\s*1$/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 관리자 권한',
      ),
    );
    // The active tab's list rendered — restore is not detail-only.
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 관리자 권한', {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('permission-requests-list')).queryByText('워크스페이스 전체 읽기', {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({
      tab: 'approved',
      selected: APPROVED_ID,
    });
  });

  test('tab click pushes tab and reselects the first visible request in one navigation', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    const lengthBefore = router.history.length;

    // Pending selection (auto-selected) is not visible in 승인됨 → reselect.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^승인됨\s*,\s*1$/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'approved',
        selected: APPROVED_ID,
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 관리자 권한',
      ),
    );
    expect(router.history.length).toBe(lengthBefore + 1);
  });

  test('tab click keeps the selection when it stays visible in the new tab', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 전체 읽기',
      ),
    );
    const lengthBefore = router.history.length;

    fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체\s*,\s*4$/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'all',
        selected: PENDING_ID,
      });
    });
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
      '워크스페이스 전체 읽기',
    );
    expect(router.history.length).toBe(lengthBefore + 1);
  });

  test('closing the detail removes selected and keeps the pending tab implicit', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));

    await waitFor(() =>
      expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument(),
    );
    // `pending` is the default tab — never written into the URL.
    expect(router.state.location.search).toEqual({});
    expect(router.history.length).toBe(lengthBefore + 1);
    // Rows still rendered → the closed-panel assertion is not vacuous.
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 전체 읽기', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  test('Back after a tab change restores the previous tab and selection', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^승인됨\s*,\s*1$/ }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'approved',
        selected: APPROVED_ID,
      });
    });

    router.history.back();

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: PENDING_ID });
    });
    expect(screen.getByRole('tab', { name: /^대기 중\s*,\s*1$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 전체 읽기',
      ),
    );
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 전체 읽기', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  test('selected that is not visible in the active tab is reselected via replace', async () => {
    const router = renderUrlState(
      `/admin/permissions/requests?tab=approved&selected=${PENDING_ID}`,
    );
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'approved',
        selected: APPROVED_ID,
      });
    });
    // Replaced, not pushed: history did not grow.
    expect(router.history.length).toBe(1);
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 관리자 권한',
      ),
    );
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 관리자 권한', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  test('closing a restored selection on ?tab=all stays closed (no re-open)', async () => {
    const router = renderUrlState(`/admin/permissions/requests?tab=all&selected=${APPROVED_ID}`);
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        '워크스페이스 관리자 권한',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() =>
      expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument(),
    );
    // Give any stray reconcile effect a chance to re-select before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.search).toEqual({ tab: 'all' });
    expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 전체 읽기', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  test('Back to a deliberately closed pending panel keeps it closed', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    await waitFor(() =>
      expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^승인됨\s*,\s*1$/ }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: 'approved', selected: APPROVED_ID }),
    );
    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('워크스페이스 전체 읽기', {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  test('a deferred old selected read never replaces the new URL selection or its draft', async () => {
    installFetch();
    const base = globalThis.fetch;
    let resolveOld: ((response: Response) => void) | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === `/permissions/requests/${PENDING_ID}`
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : base(input, init),
    ) as typeof fetch;
    const { router, queryClient } = buildHarness({ initialPath: '/admin/permissions/requests' });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByText('요청 상세를 불러오는 중입니다.');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^추가 정보 필요/ }));
    await screen.findByText('need detail');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'new selected draft' } });
    await act(async () => {
      resolveOld?.(response(adminDetailFixture(REQUESTS[0])));
      await Promise.resolve();
    });
    expect(router.state.location.search).toEqual({
      tab: 'needs_more_info',
      selected: REQUESTS[1].id,
    });
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent('need detail');
    expect(screen.getByLabelText(/^사유/)).toHaveValue('new selected draft');
  });

  test('another selection clears prior risk and decision draft', async () => {
    installFetch();
    const base = globalThis.fetch;
    const oldRisk: PermissionRiskIndicator = {
      code: 'sensitive_capability',
      evidence: { capability: 'workspace.read' },
    };
    const selectedRisk: PermissionRiskIndicator = {
      code: 'no_expiration',
      evidence: { requested_expiration: null },
    };
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/permissions/requests/${PENDING_ID}`)
        return Promise.resolve(
          response(
            adminDetailFixture(REQUESTS[0], false, 'allowed', { risk_indicators: [oldRisk] }),
          ),
        );
      if (url === `/permissions/requests/${REQUESTS[1].id}`)
        return Promise.resolve(
          response(
            adminDetailFixture(REQUESTS[1], false, 'allowed', { risk_indicators: [selectedRisk] }),
          ),
        );
      return base(input, init);
    }) as typeof fetch;
    const { router, queryClient } = buildHarness({ initialPath: '/admin/permissions/requests' });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('민감한 권한 · 워크스페이스 전체 읽기');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByLabelText(/^사유/), {
      target: { value: 'previous request draft' },
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^추가 정보 필요/ }));

    await screen.findByText('요청 만료일 없음');
    expect(screen.queryByText('민감한 권한 · 워크스페이스 전체 읽기')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    expect(screen.getByLabelText(/^사유/)).toHaveValue('');
  });

  test('a delayed old risk read cannot replace the new selection or its draft', async () => {
    installFetch();
    const base = globalThis.fetch;
    let resolveOld: ((value: Response) => void) | undefined;
    const oldRisk: PermissionRiskIndicator = {
      code: 'sensitive_capability',
      evidence: { capability: 'workspace.read' },
    };
    const selectedRisk: PermissionRiskIndicator = {
      code: 'no_expiration',
      evidence: { requested_expiration: null },
    };
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/permissions/requests/${PENDING_ID}`)
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      if (url === `/permissions/requests/${REQUESTS[1].id}`)
        return Promise.resolve(
          response(
            adminDetailFixture(REQUESTS[1], false, 'allowed', { risk_indicators: [selectedRisk] }),
          ),
        );
      return base(input, init);
    }) as typeof fetch;
    const { router, queryClient } = buildHarness({ initialPath: '/admin/permissions/requests' });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('요청 상세를 불러오는 중입니다.');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^추가 정보 필요/ }));
    await screen.findByText('요청 만료일 없음');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByLabelText(/^사유/), {
      target: { value: 'new selected draft' },
    });

    await act(async () => {
      resolveOld?.(
        response(adminDetailFixture(REQUESTS[0], false, 'allowed', { risk_indicators: [oldRisk] })),
      );
      await Promise.resolve();
    });

    expect(router.state.location.search).toEqual({
      tab: 'needs_more_info',
      selected: REQUESTS[1].id,
    });
    expect(screen.getByTestId('permission-request-risk-review')).toHaveTextContent(
      '요청 만료일 없음',
    );
    expect(screen.queryByText('민감한 권한 · 워크스페이스 전체 읽기')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^사유/)).toHaveValue('new selected draft');
  });

  test('a parser failure stays unavailable until retry returns a successful empty result', async () => {
    installFetch();
    const base = globalThis.fetch;
    let detailReads = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `/permissions/requests/${PENDING_ID}` && ++detailReads === 1)
        return Promise.resolve(
          response({
            ...adminDetailFixture(REQUESTS[0]),
            risk_indicators: [{ code: 'unknown_flag', evidence: {} }],
          }),
        );
      return base(input, init);
    }) as typeof fetch;
    const { router, queryClient } = buildHarness({
      initialPath: `/admin/permissions/requests?selected=${PENDING_ID}`,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('요청 상세를 불러오지 못했습니다. 다시 확인해 주세요.');
    expect(screen.queryByText('추가 확인 사항 없음')).not.toBeInTheDocument();
    expect(screen.queryByTestId('permission-decision-section')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));

    await screen.findByText('추가 확인 사항 없음');
    expect(detailReads).toBe(2);
    expect(router.state.location.search).toEqual({ selected: PENDING_ID });
  });

  test('failed selected detail retains URL selection and offers a retry without decisions', async () => {
    installFetch();
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === `/permissions/requests/${PENDING_ID}`
        ? Promise.resolve(response({ code: 'internal.unexpected', message: 'failed read' }, 500))
        : base(input, init),
    ) as typeof fetch;
    const { router, queryClient } = buildHarness({
      initialPath: `/admin/permissions/requests?selected=${PENDING_ID}`,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByText('요청 상세를 불러오지 못했습니다. 다시 확인해 주세요.');
    expect(router.state.location.search).toEqual({ selected: PENDING_ID });
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeEnabled();
    expect(screen.queryByTestId('permission-decision-section')).not.toBeInTheDocument();
  });

  test('a failed list fetch does not clear a deep-linked selection', async () => {
    installFetch();
    const base = globalThis.fetch;
    let listCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/permissions/requests?status=all') {
        listCalls += 1;
        return response({ code: 'internal.unexpected', message: 'boom' }, 500);
      }
      return base(input, init);
    }) as typeof globalThis.fetch;
    const { router, queryClient } = buildHarness({
      initialPath: `/admin/permissions/requests?selected=${PENDING_ID}`,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(router.state.location.search).toEqual({ selected: PENDING_ID });
  });
});
