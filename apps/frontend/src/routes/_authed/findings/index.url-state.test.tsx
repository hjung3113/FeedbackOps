// /findings URL-state tests (issue #396).
//
// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /findings?managedSystem=:managedSystemId|all&selected=:findingId.
// Verifies restore-on-load, push-on-select with working Back, atomic scope-change +
// selection-drop, replace-away of a stale selection, a failed list load never
// clearing a deep-linked selection, and the managed_system_id wire contract.
//
// Harness: createRoute + memory history with the route's own search schema (same
// pattern as ../admin/analytics-areas.url-state.test.tsx). The detail panel is
// component-mocked (it owns its own /findings/:id fetch, out of scope here); the
// list fetch is a real mocked global fetch.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/features/findings/components/FindingDetail', () => ({
  FindingDetailPanel: ({ findingId }: { findingId: string }) => (
    <section data-testid="finding-detail-panel">finding:{findingId}</section>
  ),
}));

import { FindingsListPage, findingsSearchSchema } from './index';

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_1 = '99999999-9999-9999-9999-999999999901';
const MS_2 = '99999999-9999-9999-9999-999999999902';
const F1_ID = '11111111-1111-4111-8111-111111111111';
const F2_ID = '44444444-4444-4444-4444-444444444444';
const STALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const F1 = {
  id: F1_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'FND-101',
  primary_managed_system_id: MS_1,
  title: '결제 실패 반복',
  summary: '결제 실패 VOC가 반복됩니다.',
  source_type: 'voc_cluster' as const,
  source_id: '22222222-2222-2222-2222-222222222222',
  evidence_count: 3,
  severity: 'high' as const,
  confidence: 'medium' as const,
  status: 'active' as const,
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: '33333333-3333-3333-3333-333333333333',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  source: null,
};

const FINDINGS = [
  F1,
  {
    ...F1,
    id: F2_ID,
    display_id: 'FND-102',
    primary_managed_system_id: MS_2,
    title: '배송 지연 문의 증가',
    source_type: 'manual' as const,
    source_id: null,
    evidence_count: 1,
    severity: 'medium' as const,
    confidence: null,
    status: 'draft' as const,
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-04T00:00:00.000Z',
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
    if (path.pathname === '/findings') {
      if (c.failList) return jsonResponse({ code: 'internal.unexpected' }, 500);
      const msFilter = path.searchParams.get('managed_system_id');
      const items = msFilter
        ? FINDINGS.filter((finding) => finding.primary_managed_system_id === msFilter)
        : FINDINGS;
      return jsonResponse({ items });
    }
    if (path.pathname === '/actors') return jsonResponse({ actors: [] });
    return jsonResponse({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderUrlState(c: FetchCase, initialPath: string) {
  installFetch(c);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/findings',
    validateSearch: (raw) => findingsSearchSchema.parse(raw),
    component: FindingsListPage,
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

describe('/findings URL state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('?selected=<id> opens that finding after load and keeps the list context', async () => {
    const router = renderUrlState({ requested: [] }, `/findings?selected=${F1_ID}`);
    const detail = await screen.findByTestId('finding-detail-panel');
    expect(detail).toHaveTextContent(`finding:${F1_ID}`);
    // List rendered alongside the detail — restore is not detail-only.
    expect(await screen.findByRole('button', { name: /FND-101/ })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: F1_ID });
  });

  test('row click pushes selected and Back returns to no selection', async () => {
    const router = renderUrlState({ requested: [] }, '/findings');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument(),
    );
    const lengthBefore = router.history.length;

    fireEvent.click(screen.getByRole('button', { name: /FND-101/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ selected: F1_ID });
    });
    expect(screen.getByTestId('finding-detail-panel')).toHaveTextContent(`finding:${F1_ID}`);
    expect(router.history.length).toBe(lengthBefore + 1);

    router.history.back();
    await waitFor(() => {
      expect(screen.queryByTestId('finding-detail-panel')).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toEqual({});
    // Rows still rendered → the closed-panel assertion is not vacuous.
    expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument();
  });

  test('scope change drops selected in the same navigation and refetches the new scope', async () => {
    // No Managed System selector UI exists on this route yet — the scope change
    // is driven through the router exactly as a future selector would.
    const c: FetchCase = { requested: [] };
    const router = renderUrlState(c, `/findings?managedSystem=${MS_1}&selected=${F1_ID}`);
    await waitFor(() => expect(screen.getByTestId('finding-detail-panel')).toBeInTheDocument());
    expect(
      c.requested.some(
        (url) => url.startsWith('/findings') && url.includes(`managed_system_id=${MS_1}`),
      ),
    ).toBe(true);
    const lengthBefore = router.history.length;

    await router.navigate({ to: '/findings', search: { managedSystem: 'all' } });

    // One navigation lands on the new scope with no selected key.
    expect(router.state.location.search).toEqual({ managedSystem: 'all' });
    expect(router.history.length).toBe(lengthBefore + 1);
    // New scope refetched (the list query key includes the scope)…
    await waitFor(() =>
      expect(
        c.requested.some(
          (url) => url.startsWith('/findings') && !url.includes('managed_system_id'),
        ),
      ).toBe(true),
    );
    // …and the unscoped list rendered both rows.
    expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FND-102/ })).toBeInTheDocument();
    expect(screen.queryByTestId('finding-detail-panel')).not.toBeInTheDocument();
  });

  test('stale selected uuid not in the list is replaced away after load', async () => {
    const router = renderUrlState({ requested: [] }, `/findings?selected=${STALE_ID}`);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    // Replaced, not pushed: history did not grow.
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('finding-detail-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument();
  });

  test('a failed list fetch does not clear a deep-linked selected', async () => {
    const router = renderUrlState({ requested: [], failList: true }, `/findings?selected=${F1_ID}`);
    // 4s: the list hook retries one 5xx before settling into the error state.
    await waitFor(() => expect(screen.getByTestId('finding-list-error')).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(router.state.location.search).toEqual({ selected: F1_ID });
  });

  test('managedSystem=all sends no managed_system_id; a uuid sends it', async () => {
    const all: FetchCase = { requested: [] };
    renderUrlState(all, '/findings?managedSystem=all');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument(),
    );
    expect(all.requested.some((url) => url.startsWith('/findings'))).toBe(true);
    expect(
      all.requested.some((url) => url.startsWith('/findings') && url.includes('managed_system_id')),
    ).toBe(false);
  });

  test('managedSystem=<uuid> passes managed_system_id to the list fetch', async () => {
    const scoped: FetchCase = { requested: [] };
    renderUrlState(scoped, `/findings?managedSystem=${MS_1}`);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument(),
    );
    expect(
      scoped.requested.some(
        (url) => url.startsWith('/findings') && url.includes(`managed_system_id=${MS_1}`),
      ),
    ).toBe(true);
    // Only the MS_1 finding is in the scoped list.
    expect(screen.queryByRole('button', { name: /FND-102/ })).not.toBeInTheDocument();
  });

  test('strict search schema rejects invalid values and unknown keys', () => {
    expect(() => findingsSearchSchema.parse({ selected: 'not-a-uuid' })).toThrow();
    expect(() => findingsSearchSchema.parse({ managedSystem: 'all ' })).toThrow();
    expect(() => findingsSearchSchema.parse({ selected: F1_ID, onload: 'x' })).toThrow();
    expect(findingsSearchSchema.parse({})).toEqual({});
    expect(findingsSearchSchema.parse({ managedSystem: 'all' })).toEqual({
      managedSystem: 'all',
    });
  });

  test('a selection outside the narrower scope is replaced away after load', async () => {
    // F2 belongs to MS_2; the scoped list (MS_1) does not contain it.
    const router = renderUrlState(
      { requested: [] },
      `/findings?managedSystem=${MS_1}&selected=${F2_ID}`,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument(),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_1 }));
    expect(router.history.length).toBe(1);
    expect(screen.queryByTestId('finding-detail-panel')).not.toBeInTheDocument();
  });
});
