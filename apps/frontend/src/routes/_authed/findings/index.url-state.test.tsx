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
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  FindingDetailPanel: ({
    findingId,
    headerExtras,
  }: {
    findingId: string;
    headerExtras?: React.ReactNode;
  }) => (
    <section data-testid="finding-detail-panel">
      <header data-kind="finding">
        <div data-testid="detail-panel-header-content">{headerExtras}</div>
      </header>
      <div>finding:{findingId}</div>
    </section>
  ),
}));

import { FindingsListPage, findingsSearchSchema } from './index';

// uuid-shaped ids — the search schema rejects non-uuid values.
const MS_1 = '99999999-9999-9999-9999-999999999901';
const MS_2 = '99999999-9999-9999-9999-999999999902';
const F1_ID = '11111111-1111-4111-8111-111111111111';
const F2_ID = '44444444-4444-4444-4444-444444444444';
const STALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

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
  findingsResponse?: () => Promise<Response>;
  failList?: boolean;
  failuresRemaining?: number;
  emptyList?: boolean;
  emptyExecutionNone?: boolean;
}

function installFetch(c: FetchCase): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    c.requested.push(url);
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/findings') {
      if (c.findingsResponse) return c.findingsResponse();
      if (c.failList) return jsonResponse({ code: 'internal.unexpected' }, 500);
      if (c.failuresRemaining !== undefined && c.failuresRemaining > 0) {
        c.failuresRemaining -= 1;
        return jsonResponse({ code: 'internal.unexpected' }, 500);
      }
      if (c.emptyList) return jsonResponse({ items: [] });
      if (c.emptyExecutionNone && path.searchParams.get('execution') === 'none') {
        return jsonResponse({ items: [] });
      }
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

function renderUrlState(
  c: FetchCase,
  initialPath: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  installFetch(c);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/findings',
    validateSearch: (raw) => findingsSearchSchema.parse(raw),
    component: FindingsListPage,
  });
  const vocRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vocs',
    component: () => <div data-testid="voc-origin-context" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, vocRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
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

  test('selected Finding exposes a return link to the exact VOC context', async () => {
    const origin =
      `/vocs?view=triage&managedSystem=${MS_1}` +
      `&selected=${F2_ID}&tab=high&filter.severity=critical`;
    const router = renderUrlState(
      { requested: [] },
      `/findings?selected=${F1_ID}&returnTo=${encodeURIComponent(origin)}`,
    );

    await screen.findByTestId('finding-detail-panel');

    expect(screen.getByRole('link', { name: '원래 VOC로 돌아가기' })).toHaveAttribute(
      'href',
      origin,
    );
    expect(
      screen.getByRole('link', { name: '원래 VOC로 돌아가기' }).closest('[data-kind="finding"]'),
    ).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: F1_ID, returnTo: origin });
  });

  test.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('%s-clicking the header return link preserves browser handling', async (_, modifiers) => {
    const origin = `/vocs?view=triage&managedSystem=${MS_1}&selected=${F2_ID}`;
    renderUrlState(
      { requested: [] },
      `/findings?selected=${F1_ID}&returnTo=${encodeURIComponent(origin)}`,
    );
    const link = await screen.findByRole('link', { name: '원래 VOC로 돌아가기' });

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  test('returning to the VOC context uses client-side router navigation', async () => {
    const origin = `/vocs?view=triage&managedSystem=${MS_1}&selected=${F2_ID}&tab=high`;
    const router = renderUrlState(
      { requested: [] },
      `/findings?selected=${F1_ID}&returnTo=${encodeURIComponent(origin)}`,
    );

    await userEvent.click(await screen.findByRole('link', { name: '원래 VOC로 돌아가기' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
    expect(router.state.location.search).toEqual({
      view: 'triage',
      managedSystem: MS_1,
      selected: F2_ID,
      tab: 'high',
    });
    expect(screen.getByTestId('voc-origin-context')).toBeInTheDocument();
  });

  test('does not render a return link when a VOC search value is invalid', async () => {
    const returnTo = '/vocs?selected=not-a-uuid';
    renderUrlState(
      { requested: [] },
      `/findings?selected=${F1_ID}&returnTo=${encodeURIComponent(returnTo)}`,
    );

    await screen.findByTestId('finding-detail-panel');

    expect(screen.queryByRole('link', { name: '원래 VOC로 돌아가기' })).not.toBeInTheDocument();
  });

  test('keeps the new selection while a stale Findings cache is refetched', async () => {
    const origin = `/vocs?view=triage&selected=${F1_ID}`;
    let resolveFindingsResponse!: (response: Response) => void;
    const pendingFindingsResponse = new Promise<Response>((resolve) => {
      resolveFindingsResponse = resolve;
    });
    const c: FetchCase = {
      requested: [],
      findingsResponse: () => pendingFindingsResponse,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['findings', { managedSystemId: undefined, execution: undefined }], {
      items: [F1],
    });
    await queryClient.invalidateQueries({ queryKey: ['findings'] });

    const router = renderUrlState(
      c,
      `/findings?selected=${F2_ID}&returnTo=${encodeURIComponent(origin)}`,
      queryClient,
    );

    await waitFor(() => expect(c.requested.some((url) => url.startsWith('/findings'))).toBe(true));
    expect(router.state.location.search).toEqual({ selected: F2_ID, returnTo: origin });
    expect(screen.getByTestId('finding-detail-panel')).toHaveTextContent(`finding:${F2_ID}`);
    expect(screen.getByRole('link', { name: '원래 VOC로 돌아가기' })).toHaveAttribute(
      'href',
      origin,
    );

    await act(async () => {
      resolveFindingsResponse(jsonResponse({ items: FINDINGS }));
    });

    expect(await screen.findByRole('button', { name: /FND-102/ })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ selected: F2_ID, returnTo: origin });
    expect(screen.getByTestId('finding-detail-panel')).toHaveTextContent(`finding:${F2_ID}`);
    expect(screen.getByRole('link', { name: '원래 VOC로 돌아가기' })).toHaveAttribute(
      'href',
      origin,
    );
  });

  test('ignores an external return URL', async () => {
    const returnTo = 'https://example.com/vocs?view=inbox';
    renderUrlState(
      { requested: [] },
      `/findings?selected=${F1_ID}&returnTo=${encodeURIComponent(returnTo)}`,
    );

    await screen.findByTestId('finding-detail-panel');

    expect(screen.queryByRole('link', { name: '원래 VOC로 돌아가기' })).not.toBeInTheDocument();
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

  test('execution=none is sent on the findings fetch and omitted when absent', async () => {
    const filtered: FetchCase = { requested: [] };
    const router = renderUrlState(
      filtered,
      `/findings?managedSystem=${MS_1}&selected=${F1_ID}&execution=none`,
    );
    await waitFor(() =>
      expect(
        filtered.requested.some((url) => {
          const path = new URL(url, 'http://localhost');
          return (
            path.pathname === '/findings' &&
            path.searchParams.get('execution') === 'none' &&
            path.searchParams.get('managed_system_id') === MS_1
          );
        }),
      ).toBe(true),
    );
    expect(await screen.findByRole('button', { name: /FND-101/ })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({
      managedSystem: MS_1,
      selected: F1_ID,
      execution: 'none',
    });

    cleanup();
    const open: FetchCase = { requested: [] };
    renderUrlState(open, '/findings');
    await waitFor(() =>
      expect(
        open.requested.some((url) => new URL(url, 'http://localhost').pathname === '/findings'),
      ).toBe(true),
    );
    expect(
      open.requested.some((url) => {
        const path = new URL(url, 'http://localhost');
        return path.pathname === '/findings' && path.searchParams.has('execution');
      }),
    ).toBe(false);
  });

  test('shows the true-empty Finding message and keeps the zero count', async () => {
    renderUrlState({ requested: [], emptyList: true }, '/findings');

    expect(await screen.findByText('생성된 Finding이 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText('VOC 근거에서 실행 후보로 승격된 Finding이 여기에 표시됩니다.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0개')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  test('clears the execution URL filter and restores Findings after a filtered miss', async () => {
    const filtered: FetchCase = { requested: [], emptyExecutionNone: true };
    const router = renderUrlState(filtered, `/findings?managedSystem=${MS_1}&execution=none`);

    expect(await screen.findByText('현재 조건에 맞는 Finding이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('실행과 연결되지 않은 Finding만 표시 중입니다.')).toBeInTheDocument();
    expect(screen.getByText('0개')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_1 }));
    expect(screen.getByRole('button', { name: /FND-101/ })).toBeInTheDocument();
  });

  test('drops a stale selection when execution=none and both list queries are empty', async () => {
    const empty: FetchCase = { requested: [], emptyList: true };
    const router = renderUrlState(empty, `/findings?execution=none&selected=${UNKNOWN_ID}`);

    expect(await screen.findByText('생성된 Finding이 없습니다.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toEqual({ execution: 'none' }));
    const paths = empty.requested.map((url) => new URL(url, 'http://localhost'));
    expect(
      paths.some(
        (path) => path.pathname === '/findings' && path.searchParams.get('execution') === 'none',
      ),
    ).toBe(true);
    expect(
      paths.some((path) => path.pathname === '/findings' && !path.searchParams.has('execution')),
    ).toBe(true);
  });

  test('retries an ordinary Finding list error through the query refetch', async () => {
    const retrying: FetchCase = { requested: [], failuresRemaining: 2 };
    renderUrlState(retrying, '/findings');

    await waitFor(
      () => expect(screen.getByText('Finding 목록을 불러오지 못했습니다')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    const attemptsBeforeRetry = retrying.requested.filter(
      (url) => new URL(url, 'http://localhost').pathname === '/findings',
    ).length;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('button', { name: /FND-101/ })).toBeInTheDocument();
    const attemptsAfterRetry = retrying.requested.filter(
      (url) => new URL(url, 'http://localhost').pathname === '/findings',
    ).length;
    expect(attemptsAfterRetry).toBeGreaterThan(attemptsBeforeRetry);
  });

  test('strict search schema rejects invalid values and unknown keys', () => {
    expect(() => findingsSearchSchema.parse({ selected: 'not-a-uuid' })).toThrow();
    expect(() => findingsSearchSchema.parse({ managedSystem: 'all ' })).toThrow();
    expect(() => findingsSearchSchema.parse({ selected: F1_ID, onload: 'x' })).toThrow();
    expect(findingsSearchSchema.parse({})).toEqual({});
    expect(findingsSearchSchema.parse({ managedSystem: 'all' })).toEqual({
      managedSystem: 'all',
    });
    expect(findingsSearchSchema.parse({ selected: F1_ID, returnTo: '/vocs?view=inbox' })).toEqual({
      selected: F1_ID,
      returnTo: '/vocs?view=inbox',
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
