// /voc-clusters URL-state tests (issue #396).
//
// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /voc-clusters?managedSystem=:managedSystemId|all&selected=:clusterId.
// Verifies restore-on-load, replace-based first-row defaulting that never overrides a
// deep link and never re-fires after close, push-on-select with working Back,
// atomic scope-change + selection-drop, replace-away of a stale selection, a failed
// list load never clearing a deep-linked selection, and the managed_system_id wire
// contract.
//
// Harness: createRoute + memory history with the route's own search schema (same
// pattern as ../admin/analytics-areas.url-state.test.tsx); fetch mocked globally.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    // The real ListShell only mounts the detail panel at desktop breakpoints;
    // render it unconditionally so selection is observable (same approach as
    // ../admin/permissions/requests.url-state.test.tsx).
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

import { VocClusterListPage, vocClustersSearchSchema } from './index';

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_1 = '99999999-9999-9999-9999-999999999901';
const MS_2 = '99999999-9999-9999-9999-999999999902';
const C1_ID = '11111111-1111-4111-8111-111111111111';
const C2_ID = '55555555-5555-4555-8555-555555555555';
const STALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const C1 = {
  id: C1_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'CLU-31',
  title: '반복 결제 문의',
  summary: '결제 관련 VOC가 반복됩니다.',
  status: 'draft',
  primary_managed_system_id: MS_1,
  created_by: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  member_count: 0,
  members: [],
  linked_findings: [],
};

const CLUSTERS = [
  C1,
  {
    ...C1,
    id: C2_ID,
    display_id: 'CLU-32',
    title: '확정된 연결 없음',
    status: 'confirmed',
    primary_managed_system_id: MS_2,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface FetchCase {
  /** Every requested URL, in order — used for the managed_system_id assertions. */
  requested: string[];
  failList?: boolean;
}

function installFetch(c: FetchCase): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    c.requested.push(url);
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/voc-clusters') {
      if (c.failList) return jsonResponse({ code: 'internal.unexpected' }, 500);
      const msFilter = path.searchParams.get('managed_system_id');
      const items = msFilter
        ? CLUSTERS.filter((cluster) => cluster.primary_managed_system_id === msFilter)
        : CLUSTERS;
      return jsonResponse({ items });
    }
    if (path.pathname.startsWith('/voc-clusters/')) {
      const cluster = CLUSTERS.find((entry) => entry.id === path.pathname.split('/')[2]);
      return cluster ? jsonResponse(cluster) : jsonResponse({ code: 'not_found.record' }, 404);
    }
    if (path.pathname === '/managed-systems') return jsonResponse({ items: [], total: 0 });
    if (path.pathname === '/me')
      return jsonResponse({
        actor: {
          id: '22222222-2222-4222-8222-222222222222',
          external_id: 'user-1',
          email: 'user@example.com',
          display_name: '사용자',
          role_level: 'user',
        },
        workspace_id: 'ws',
      });
    if (path.pathname === '/me/permissions/check')
      return jsonResponse({
        state: 'approved',
        decision: { allow: true, via: 'role', requestable: null },
      });
    return jsonResponse({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderUrlState(c: FetchCase, initialPath: string) {
  installFetch(c);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/voc-clusters',
    validateSearch: (raw) => vocClustersSearchSchema.parse(raw),
    component: VocClusterListPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/voc-clusters URL state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('?selected=<id> opens that cluster after load and keeps the list context', async () => {
    const router = renderUrlState({ requested: [] }, `/voc-clusters?selected=${C1_ID}`);
    await waitFor(() =>
      expect(screen.getByTestId('cluster-detail-title')).toHaveTextContent('반복 결제 문의'),
    );
    // List rendered alongside the detail — restore is not detail-only.
    expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: C1_ID });
  });

  test('first load defaults to the first row via replace; row click pushes and Back restores', async () => {
    const router = renderUrlState({ requested: [] }, '/voc-clusters');
    // First-row defaulting lands via replace: the selection appears but the
    // history entry is rewritten, not pushed.
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: C1_ID });
    });
    await waitFor(() =>
      expect(screen.getByTestId('cluster-detail-title')).toHaveTextContent('반복 결제 문의'),
    );
    expect(router.history.length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /CLU-32/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: C2_ID });
    });
    await waitFor(() =>
      expect(screen.getByTestId('cluster-detail-title')).toHaveTextContent('확정된 연결 없음'),
    );
    expect(router.history.length).toBe(2);

    router.history.back();
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: C1_ID });
    });
    await waitFor(() =>
      expect(screen.getByTestId('cluster-detail-title')).toHaveTextContent('반복 결제 문의'),
    );
    // Rows still rendered → the restored-state assertion is not vacuous.
    expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CLU-32/ })).toBeInTheDocument();
  });

  test('closing the detail drops selected with a push and never re-defaults', async () => {
    const router = renderUrlState({ requested: [] }, '/voc-clusters');
    await waitFor(() => expect(screen.getByTestId('cluster-detail-panel')).toBeInTheDocument());
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(router.history.length).toBe(lengthBefore + 1);
    // Rows still rendered → the closed-panel assertion is not vacuous.
    expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument();
    // First-row defaulting must not re-fire after an explicit close.
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-32/ })).toBeInTheDocument());
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByTestId('cluster-detail-panel')).not.toBeInTheDocument();
  });

  test('scope change drops selected in the same navigation and refetches the new scope', async () => {
    // No Managed System selector UI exists on this route yet — the scope change
    // is driven through the router exactly as a future selector would.
    const c: FetchCase = { requested: [] };
    const router = renderUrlState(c, `/voc-clusters?managedSystem=${MS_1}&selected=${C1_ID}`);
    await waitFor(() => expect(screen.getByTestId('cluster-detail-panel')).toBeInTheDocument());
    expect(
      c.requested.some(
        (url) => url.startsWith('/voc-clusters') && url.includes(`managed_system_id=${MS_1}`),
      ),
    ).toBe(true);
    const lengthBefore = router.history.length;

    await router.navigate({ to: '/voc-clusters', search: { managedSystem: 'all' } });

    // One navigation lands on the new scope with no selected key.
    expect(router.state.location.search).toEqual({ managedSystem: 'all' });
    expect(router.history.length).toBe(lengthBefore + 1);
    // New scope refetched (the list query key includes the scope)…
    await waitFor(() => expect(c.requested).toContain('/voc-clusters'));
    // …and the unscoped list rendered both rows.
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /CLU-32/ })).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-detail-panel')).not.toBeInTheDocument();
  });

  test('stale selected uuid not in the list is replaced away after load', async () => {
    const router = renderUrlState({ requested: [] }, `/voc-clusters?selected=${STALE_ID}`);
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument());
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    // Replaced, not pushed: history did not grow.
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('cluster-detail-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument();
  });

  test('a failed list fetch does not clear a deep-linked selected', async () => {
    const router = renderUrlState(
      { requested: [], failList: true },
      `/voc-clusters?selected=${C1_ID}`,
    );
    // 4s: the list hook retries one 5xx before settling into the error state.
    await waitFor(() => expect(screen.getByTestId('cluster-list-error')).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(router.state.location.search).toEqual({ selected: C1_ID });
  });

  test('managedSystem=all sends no managed_system_id; a uuid sends it', async () => {
    const all: FetchCase = { requested: [] };
    renderUrlState(all, '/voc-clusters?managedSystem=all');
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument());
    const plainListFetch = all.requested.find((url) => url === '/voc-clusters');
    expect(plainListFetch).toBeDefined();
    expect(plainListFetch?.includes('managed_system_id')).toBe(false);

    cleanup();

    const scoped: FetchCase = { requested: [] };
    renderUrlState(scoped, `/voc-clusters?managedSystem=${MS_1}`);
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument());
    const scopedListFetch = scoped.requested.find((url) => url.startsWith('/voc-clusters'));
    expect(scopedListFetch?.includes(`managed_system_id=${MS_1}`)).toBe(true);
    // Only the MS_1 cluster is in the scoped list.
    expect(screen.queryByRole('button', { name: /CLU-32/ })).not.toBeInTheDocument();
  });

  test('strict search schema rejects invalid values and unknown keys', () => {
    expect(() => vocClustersSearchSchema.parse({ selected: 'not-a-uuid' })).toThrow();
    expect(() => vocClustersSearchSchema.parse({ managedSystem: 'workspace' })).toThrow();
    expect(() => vocClustersSearchSchema.parse({ selected: C1_ID, onload: 'x' })).toThrow();
    expect(vocClustersSearchSchema.parse({})).toEqual({});
    expect(vocClustersSearchSchema.parse({ managedSystem: 'all' })).toEqual({
      managedSystem: 'all',
    });
  });

  test('a selection excluded by the tab filter is reconciled with replace (no Back trap)', async () => {
    const router = renderUrlState({ requested: [] }, `/voc-clusters?selected=${C1_ID}`);
    await waitFor(() => expect(screen.getByTestId('cluster-detail-panel')).toBeInTheDocument());
    const lengthBefore = router.history.length;

    // C1 is a draft; the "confirmed" tab hides it.
    fireEvent.click(screen.getByTestId('cluster-tab-confirmed'));

    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByTestId('cluster-detail-panel')).not.toBeInTheDocument();
    // Replaced, not pushed: history did not grow, so Back cannot re-select it.
    expect(router.history.length).toBe(lengthBefore);
    // The confirmed cluster is still listed (non-vacuous).
    expect(screen.getByRole('button', { name: /CLU-32/ })).toBeInTheDocument();
  });

  test('a selection outside the narrower scope is replaced away after load', async () => {
    // C2 belongs to MS_2, the scoped list (MS_1) does not contain it.
    const router = renderUrlState(
      { requested: [] },
      `/voc-clusters?managedSystem=${MS_1}&selected=${C2_ID}`,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /CLU-31/ })).toBeInTheDocument());
    await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_1 }));
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('cluster-detail-panel')).not.toBeInTheDocument();
  });
});
