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
    requester_actor_id: 'actor-pending',
    requested_capability: 'workspace.read',
    requested_managed_system_id: null,
    reason: 'need access',
    status: 'pending',
    created_at: '2026-07-17T00:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    requester_actor_id: 'actor-info',
    requested_capability: 'workspace.write',
    requested_managed_system_id: 'system-1',
    reason: 'need detail',
    status: 'needs_more_info',
    created_at: '2026-07-16T00:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    requester_actor_id: 'actor-approved',
    requested_capability: 'workspace.admin',
    requested_managed_system_id: null,
    reason: 'done',
    status: 'approved',
    created_at: '2026-07-15T00:00:00.000Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    requester_actor_id: 'actor-rejected',
    requested_capability: 'workspace.delete',
    requested_managed_system_id: null,
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
      expect(screen.getByRole('tab', { name: /승인됨 \(1\)/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        'workspace.admin',
      ),
    );
    // The active tab's list rendered — restore is not detail-only.
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.admin'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('permission-requests-list')).queryByText('workspace.read'),
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
    fireEvent.click(screen.getByRole('tab', { name: /승인됨 \(1\)/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'approved',
        selected: APPROVED_ID,
      });
    });
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
      'workspace.admin',
    );
    expect(router.history.length).toBe(lengthBefore + 1);
  });

  test('tab click keeps the selection when it stays visible in the new tab', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        'workspace.read',
      ),
    );
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByRole('tab', { name: /전체 \(4\)/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        tab: 'all',
        selected: PENDING_ID,
      });
    });
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
      'workspace.read',
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
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.read'),
    ).toBeInTheDocument();
  });

  test('Back after a tab change restores the previous tab and selection', async () => {
    const router = renderUrlState('/admin/permissions/requests');
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('tab', { name: /승인됨 \(1\)/ }));
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
    expect(screen.getByRole('tab', { name: /대기 중 \(1\)/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        'workspace.read',
      ),
    );
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.read'),
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
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
      'workspace.admin',
    );
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.admin'),
    ).toBeInTheDocument();
  });

  test('closing a restored selection on ?tab=all stays closed (no re-open)', async () => {
    const router = renderUrlState(`/admin/permissions/requests?tab=all&selected=${APPROVED_ID}`);
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
        'workspace.admin',
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
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.read'),
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
    fireEvent.click(screen.getByRole('tab', { name: /승인됨 \(1\)/ }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: 'approved', selected: APPROVED_ID }),
    );
    act(() => router.history.back());
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByTestId('permission-request-detail-panel')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('permission-requests-list')).getByText('workspace.read'),
    ).toBeInTheDocument();
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
