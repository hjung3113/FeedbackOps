import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  IntegrationLinksRouteShell,
  integrationLinksSearchSchema,
} from '../../../../routes/_authed/integration/links';

const LINK_A = '11111111-0000-0000-0000-0000000000a1';
const LINK_B = '22222222-0000-0000-0000-0000000000b1';
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

function stubFetch(capturedUrls: string[]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    capturedUrls.push(url);
    if (url.includes('/entity-links')) {
      const parsed = new URL(url, 'http://localhost');
      const status = parsed.searchParams.get('status');
      const items =
        status === null ? ALL_LINKS : ALL_LINKS.filter((link) => link.status === status);
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

  test('renders inventory table, status badges, hidden row, and filter controls', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness('/integration/links');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Active' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Detached' })).toBeInTheDocument();
      expect(screen.getByText(LINK_A.slice(0, 8))).toBeInTheDocument();
      expect(screen.getByText(LINK_B.slice(0, 8))).toBeInTheDocument();
      expect(screen.getByText('권한 제한')).toBeInTheDocument();
      expect(screen.getByText('필터')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Entity link 검색…')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-shell="list"]')).not.toBeNull();
    expect(urls.some((url) => url.includes('/entity-links?scope=workspace'))).toBe(true);
  });

  test('renders Korean empty state for no matching rows', async () => {
    const urls: string[] = [];
    stubFetch(urls);
    const { router, qc } = buildHarness('/integration/links?status=revoked');

    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('해당 상태의 entity_link 가 없습니다.')).toBeInTheDocument();
    });
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
    await userEvent.click(screen.getByRole('tab', { name: 'Detached' }));

    await waitFor(() => {
      expect(urls.some((url) => url.includes('status=detached'))).toBe(true);
      expect(screen.queryByText(LINK_A.slice(0, 8))).not.toBeInTheDocument();
      expect(screen.getByText(LINK_B.slice(0, 8))).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('checkbox', { name: 'related_to' }));

    await waitFor(() => {
      expect(urls.some((url) => url.includes('relation_type=related_to'))).toBe(true);
    });
  });
});
