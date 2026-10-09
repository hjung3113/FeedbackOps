import type { EntityLinkDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  IntegrationLinksRouteShell,
  integrationLinksSearchSchema,
} from '../../../../routes/_authed/integration/links';

const LINK_A = '11111111-0000-0000-0000-0000000000a1';
const LINK_B = '22222222-0000-0000-0000-0000000000b1';
const LINK_C = '33333333-0000-0000-0000-0000000000c1';
const VOC_A = '33333333-0000-0000-0000-0000000000a1';
const VOC_B = '44444444-0000-0000-0000-0000000000b1';
const VOC_C = '55555555-0000-0000-0000-0000000000c1';
const VOC_D = '66666666-0000-0000-0000-0000000000d1';
const MS_A = '77777777-0000-0000-0000-0000000000a1';
const ACTOR_A = '88888888-0000-0000-0000-0000000000a1';

const ALL_LINKS = [
  {
    id: LINK_A,
    source_type: 'voc',
    source_id: VOC_A,
    target_type: 'voc',
    target_id: VOC_B,
    relation_type: 'related_to',
    visibility: 'internal_only',
    status: 'active',
    managed_system_id: MS_A,
    created_by: ACTOR_A,
    created_at: '2026-06-18T01:00:00.000Z',
    updated_at: '2026-06-18T01:00:00.000Z',
    visibility_state: 'allowed',
  },
  {
    id: LINK_B,
    source_type: 'voc',
    source_id: VOC_C,
    target_type: 'voc',
    target_id: VOC_D,
    relation_type: 'related_to',
    status: 'detached',
    managed_system_id: MS_A,
    created_by: ACTOR_A,
    created_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-06-18T00:30:00.000Z',
    visibility_state: 'hidden',
  },
] as const;

const LINK_C_DATA = {
  ...ALL_LINKS[0],
  id: LINK_C,
  target_id: VOC_D,
  created_at: '2026-06-17T23:00:00.000Z',
} as const;

function buildHarness(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/integration/links',
    validateSearch: (raw) => integrationLinksSearchSchema.parse(raw),
    component: IntegrationLinksRouteShell,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

function stubFetch(
  capturedUrls: string[],
  links: readonly EntityLinkDto[] = ALL_LINKS,
  linkResponses?: Array<{ status: number; body: unknown }>,
  pagedInventory?: (url: URL) => {
    items: readonly EntityLinkDto[];
    page: {
      has_more: boolean;
      cursor?: string;
      status_counts?: { active: number; stale: number; detached: number; revoked: number };
    };
  },
) {
  let linkAttempt = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    capturedUrls.push(url);
    if (url.includes('/entity-links')) {
      const response = linkResponses?.[linkAttempt];
      linkAttempt += 1;
      if (response !== undefined) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      const parsed = new URL(url, 'http://localhost');
      if (pagedInventory !== undefined) {
        return new Response(JSON.stringify(pagedInventory(parsed)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const status = parsed.searchParams.get('status');
      const items = status === null ? links : links.filter((link) => link.status === status);
      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/managed-systems')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: MS_A,
              workspace_id: '40000000-0000-0000-0000-0000000000a1',
              slug: 'powerbi',
              name: 'Power BI',
              external_key: null,
              default_owner_actor_id: null,
              default_owner_team_id: null,
              archived_at: null,
              archived_by_actor_id: null,
              created_at: '2026-06-18T00:00:00.000Z',
              updated_at: '2026-06-18T00:00:00.000Z',
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/actors/resolve')) {
      return new Response(
        JSON.stringify({
          actors: [{ id: ACTOR_A, display_name: '운영자', email: 'ops@example.test' }],
          teams: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

function pagedInventoryForRoute(url: URL) {
  const cursor = url.searchParams.get('cursor');
  if (cursor === 'page-2') {
    return { items: [LINK_C_DATA], page: { has_more: false } };
  }
  if (url.searchParams.get('status') === 'active') {
    return { items: [ALL_LINKS[0]], page: { has_more: true, cursor: 'active-page-2' } };
  }
  return {
    items: [ALL_LINKS[0]],
    page: {
      has_more: true,
      cursor: 'page-2',
      status_counts: { active: 2, stale: 0, detached: 1, revoked: 0 },
    },
  };
}

describe('integration links route', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('strict search schema rejects unknown keys', () => {
    expect(() => integrationLinksSearchSchema.parse({ status: 'active', onload: 'x' })).toThrow();
    expect(integrationLinksSearchSchema.parse({ status: 'detached', type: 'related_to' })).toEqual({
      status: 'detached',
      type: 'related_to',
    });
  });

  test('renders headerless object rows with status counts, badges, hidden row, and filter controls', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^전체\s*,\s*2$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^활성\s*,\s*1$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^분리됨\s*,\s*1$/ })).toBeInTheDocument();
      expect(screen.getByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
      expect(screen.getByText(`엔티티 링크 ${LINK_B.slice(0, 8)}`)).toBeInTheDocument();
      expect(screen.getByText('권한 제한')).toBeInTheDocument();
      expect(screen.getAllByText('운영자')).toHaveLength(2);
      expect(screen.getAllByText(/업데이트/)).toHaveLength(2);
      expect(screen.getByText('필터')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('엔티티 링크 검색…')).toBeInTheDocument();
    });
    expect(screen.getByRole('list', { name: '엔티티 링크 목록' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('table', { name: '엔티티 링크 목록' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Relation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Managed System' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-shell="list"]')).not.toBeNull();
    expect(urls.some((url) => url.includes('/entity-links?scope=workspace'))).toBe(true);
  });

  test('resets a filtered status miss and restores the unfiltered rows', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness(`/integration/links?status=revoked&managedSystem=${MS_A}`);

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('현재 조건에 맞는 엔티티 링크가 없습니다')).toBeInTheDocument();
    });
    expect(screen.getByText('상태: 취소됨')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_A }));
    expect(await screen.findByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getByText(`엔티티 링크 ${LINK_B.slice(0, 8)}`)).toBeInTheDocument();
  });

  test('shows a true-empty Entity Link message without a filter-reset action', async () => {
    const urls: string[] = [];
    stubFetch(urls, []);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('엔티티 링크가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('시스템 간 연결이 생성되면 이 목록에 표시됩니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 초기화' })).not.toBeInTheDocument();
  });

  test('retries an ordinary Entity Link inventory error', async () => {
    const urls: string[] = [];
    stubFetch(urls, ALL_LINKS, [
      { status: 500, body: { code: 'internal.unexpected', message: 'server failed' } },
      { status: 500, body: { code: 'internal.unexpected', message: 'server failed' } },
      { status: 200, body: { items: [ALL_LINKS[0]] } },
    ]);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(
      () => expect(screen.getByText('엔티티 링크 목록을 불러오지 못했습니다')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    const attemptsBeforeRetry = urls.filter((url) => url.includes('/entity-links')).length;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    const attemptsAfterRetry = urls.filter((url) => url.includes('/entity-links')).length;
    expect(attemptsAfterRetry).toBeGreaterThan(attemptsBeforeRetry);
  });

  test('keeps PermissionBlockedPanel for Entity Link permission failures', async () => {
    const urls: string[] = [];
    const denied = { code: 'permission.denied', message: 'entity_link.read capability required' };
    stubFetch(urls, ALL_LINKS, [
      { status: 403, body: denied },
      { status: 403, body: denied },
    ]);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('엔티티 링크')).toBeInTheDocument(), {
      timeout: 4000,
    });
    const panel = screen.getByText('엔티티 링크');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'denied');
    expect(screen.getByText('엔티티 링크 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('entity_link.read capability required')).not.toBeInTheDocument();
    expect(screen.queryByText('엔티티 링크 목록을 불러오지 못했습니다')).not.toBeInTheDocument();
  });

  test('changing status tab updates the request status param and rendered subset', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('권한 제한');
    await userEvent.click(screen.getByRole('tab', { name: /^분리됨\s*,\s*1$/ }));

    await waitFor(() => {
      expect(urls.some((url) => url.includes('status=detached'))).toBe(true);
      expect(screen.queryByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).not.toBeInTheDocument();
      expect(screen.getByText(`엔티티 링크 ${LINK_B.slice(0, 8)}`)).toBeInTheDocument();
      expect(screen.getByText('권한 제한')).toBeInTheDocument();
    });
  });

  test('changing type filter updates the request relation_type param', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByText('권한 제한');
    await userEvent.click(screen.getByRole('button', { name: '필터' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '관련 항목' }));

    await waitFor(() => {
      expect(urls.some((url) => url.includes('relation_type=related_to'))).toBe(true);
    });
  });

  test('loads the next inventory page and appends its rows', async () => {
    const urls: string[] = [];
    stubFetch(urls, ALL_LINKS, undefined, pagedInventoryForRoute);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^활성\s*,\s*2$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));

    expect(await screen.findByText(`엔티티 링크 ${LINK_C.slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /^활성\s*,\s*2$/ })).toBeInTheDocument();
    expect(
      urls.some(
        (rawUrl) => new URL(rawUrl, 'http://localhost').searchParams.get('cursor') === 'page-2',
      ),
    ).toBe(true);
  });

  test('filter changes discard loaded pages and request the first filtered page', async () => {
    const urls: string[] = [];
    stubFetch(urls, ALL_LINKS, undefined, pagedInventoryForRoute);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByText(`엔티티 링크 ${LINK_C.slice(0, 8)}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^활성/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ status: 'active' });
      expect(screen.queryByText(`엔티티 링크 ${LINK_C.slice(0, 8)}`)).not.toBeInTheDocument();
      expect(screen.getByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    });
    expect(
      urls.some((rawUrl) => {
        const url = new URL(rawUrl, 'http://localhost');
        return url.searchParams.get('status') === 'active' && !url.searchParams.has('cursor');
      }),
    ).toBe(true);
  });

  test('returning to a cached inventory filter refetches only its first page', async () => {
    const urls: string[] = [];
    stubFetch(urls, ALL_LINKS, undefined, pagedInventoryForRoute);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const loadSecondPage = async () => {
      await userEvent.click(screen.getByRole('button', { name: '더 보기' }));
      expect(await screen.findByText(`엔티티 링크 ${LINK_C.slice(0, 8)}`)).toBeInTheDocument();
    };
    const allFirstPageRequests = () =>
      urls.filter((rawUrl) => {
        const url = new URL(rawUrl, 'http://localhost');
        return (
          url.pathname.endsWith('/entity-links') &&
          url.searchParams.get('scope') === 'workspace' &&
          !url.searchParams.has('status') &&
          !url.searchParams.has('relation_type') &&
          !url.searchParams.has('managed_system_id') &&
          !url.searchParams.has('cursor')
        );
      });
    const navigateToSearch = async (search: { type?: 'related_to'; managedSystem?: string }) => {
      await act(async () => {
        await router.navigate({ to: '/integration/links', search });
      });
    };
    const expectAllFirstPageReloaded = async (previousRequestCount: number) => {
      await waitFor(() => {
        expect(router.state.location.search).toEqual({});
        expect(screen.getByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
        expect(screen.queryByText(`엔티티 링크 ${LINK_C.slice(0, 8)}`)).not.toBeInTheDocument();
        expect(allFirstPageRequests()).toHaveLength(previousRequestCount + 1);
      });
    };

    expect(await screen.findByText(`엔티티 링크 ${LINK_A.slice(0, 8)}`)).toBeInTheDocument();
    await loadSecondPage();
    const afterInitialLoad = allFirstPageRequests().length;
    await userEvent.click(screen.getByRole('tab', { name: /^활성/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ status: 'active' }));
    await userEvent.click(screen.getByRole('tab', { name: /^전체/ }));
    await expectAllFirstPageReloaded(afterInitialLoad);

    await loadSecondPage();
    const afterSecondLoad = allFirstPageRequests().length;
    await navigateToSearch({ type: 'related_to' });
    await waitFor(() => expect(router.state.location.search).toEqual({ type: 'related_to' }));
    await navigateToSearch({});
    await expectAllFirstPageReloaded(afterSecondLoad);

    await loadSecondPage();
    const afterThirdLoad = allFirstPageRequests().length;
    await navigateToSearch({ managedSystem: MS_A });
    await waitFor(() => expect(router.state.location.search).toEqual({ managedSystem: MS_A }));
    await navigateToSearch({});
    await expectAllFirstPageReloaded(afterThirdLoad);
  });

  // #706 — status tab counts are unknown until the counts read succeeds;
  // unknown must never render as 0.
  test.each(['pending', 'failed', 'loaded-empty'] as const)(
    'shows status tab counts only after the counts read succeeds (%s)',
    async (state) => {
      const urls: string[] = [];
      if (state === 'pending') {
        // Never resolves: pins the counts read in its pending state. (The
        // tsconfig lib predates Promise.withResolvers, and no resolver is
        // needed.)
        globalThis.fetch = vi.fn(
          async () => new Promise<Response>(() => undefined),
        ) as typeof globalThis.fetch;
      } else if (state === 'failed') {
        stubFetch(urls, ALL_LINKS, [
          { status: 500, body: { code: 'internal.unexpected', message: 'server failed' } },
          { status: 500, body: { code: 'internal.unexpected', message: 'server failed' } },
        ]);
      } else {
        stubFetch(urls, [], undefined, () => ({
          items: [],
          page: {
            has_more: false,
            status_counts: { active: 0, stale: 0, detached: 0, revoked: 0 },
          },
        }));
      }
      const { router, qc } = buildHarness('/integration/links');

      render(
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );

      if (state === 'pending') {
        await waitFor(() => expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument());
        expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^활성\s*,\s*\d+$/ })).not.toBeInTheDocument();
        return;
      }
      if (state === 'failed') {
        await waitFor(
          () =>
            expect(screen.getByText('엔티티 링크 목록을 불러오지 못했습니다')).toBeInTheDocument(),
          { timeout: 4000 },
        );
        expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^오래됨\s*,\s*\d+$/ })).not.toBeInTheDocument();
        return;
      }
      expect(await screen.findByRole('tab', { name: /^전체\s*,\s*0$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^오래됨\s*,\s*0$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^취소됨\s*,\s*0$/ })).toBeInTheDocument();
    },
  );

  test('recovers from a failed read through a no-data refetch to real zero counts', async () => {
    const urls: string[] = [];
    let releaseRead: (() => void) | undefined;
    const refetchBody = {
      items: [],
      page: { has_more: false, status_counts: { active: 0, stale: 0, detached: 0, revoked: 0 } },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      urls.push(url);
      if (url.includes('/entity-links')) {
        const attempt = urls.filter((rawUrl) => rawUrl.includes('/entity-links')).length;
        if (attempt <= 2) {
          return new Response(
            JSON.stringify({ code: 'internal.unexpected', message: 'server failed' }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          );
        }
        // Third read (the refetch) stays pending until the test releases it.
        return new Promise<Response>((resolve) => {
          releaseRead = () =>
            resolve(
              new Response(JSON.stringify(refetchBody), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            );
        });
      }
      if (url.includes('/managed-systems')) {
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/actors/resolve')) {
        return new Response(JSON.stringify({ actors: [], teams: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not mocked', { status: 500 });
    }) as typeof globalThis.fetch;

    const { router, qc } = buildHarness('/integration/links');
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(
      () => expect(screen.getByText('엔티티 링크 목록을 불러오지 못했습니다')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();

    const callsBeforeRefetch = urls.filter((rawUrl) => rawUrl.includes('/entity-links')).length;
    await userEvent.click(screen.getByRole('button', { name: '새로고침' }));

    // Post-error refetch resets to pending with no data: the error view clears
    // and counts stay absent while it is unresolved.
    await waitFor(() =>
      expect(urls.filter((rawUrl) => rawUrl.includes('/entity-links')).length).toBeGreaterThan(
        callsBeforeRefetch,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('엔티티 링크 목록을 불러오지 못했습니다')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();

    await act(async () => {
      releaseRead?.();
    });

    expect(await screen.findByRole('tab', { name: /^전체\s*,\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^오래됨\s*,\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^취소됨\s*,\s*0$/ })).toBeInTheDocument();
  });
});
