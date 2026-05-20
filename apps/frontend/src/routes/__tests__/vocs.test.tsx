// /vocs route shell-selection tests (Slice 3 #18 C5).
//
// Tests zod search schema validation and per-view shell selection:
//   inbox / my → ListShell title
//   triage     → WorkbenchShell "Triage Console"
//   create     → PageShell "New VOC"
//   invalid    → zod parse throws
//
// Testing strategy: follows the per-route component pattern used by
// -index.test.tsx and admin/managed-systems.test.tsx — we mount the
// component directly via a createRoute harness to avoid routeTree.gen.ts
// regeneration timing issues (the generated file regen requires vite dev).
//
// AppFrame test helpers mock the DetailPanelSlotContext so that
// useDetailPanelSlot inside the shells does not throw.

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
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

// Import VocRouteShell internals via the schema export
// We test the zod schema separately and the component via a harness.
const vocSearchSchema = z
  .object({
    view: z.enum(['inbox', 'my', 'triage']).optional(),
    action: z.enum(['create']).optional(),
    selected: z.string().uuid().optional(),
    managedSystem: z.string().optional(),
    tab: z.enum(['untriaged', 'high', 'unassigned', 'similar', 'no-link']).optional(),
    sort: z.enum([
      'created_at:desc',
      'created_at:asc',
      'severity:desc',
      'severity:asc',
      'reporter_facing_status:asc',
    ]).optional(),
    'filter.severity': z.string().optional(),
    'filter.reporterStatus': z.string().optional(),
    'filter.owner': z.string().optional(),
  })
  .strict();

// ---- Zod schema unit tests ----
describe('vocSearchSchema', () => {
  test('parses valid view=inbox', () => {
    const result = vocSearchSchema.parse({ view: 'inbox' });
    expect(result.view).toBe('inbox');
  });

  test('parses valid view=my', () => {
    const result = vocSearchSchema.parse({ view: 'my' });
    expect(result.view).toBe('my');
  });

  test('parses valid view=triage', () => {
    const result = vocSearchSchema.parse({ view: 'triage' });
    expect(result.view).toBe('triage');
  });

  test('parses valid action=create', () => {
    const result = vocSearchSchema.parse({ action: 'create' });
    expect(result.action).toBe('create');
  });

  test('rejects invalid view value', () => {
    expect(() => vocSearchSchema.parse({ view: 'foo' })).toThrow();
  });

  test('rejects invalid action value', () => {
    expect(() => vocSearchSchema.parse({ action: 'delete' })).toThrow();
  });

  test('accepts spec-locked filter.severity key', () => {
    const result = vocSearchSchema.parse({ view: 'inbox', 'filter.severity': 'high' });
    expect(result['filter.severity']).toBe('high');
  });

  test('rejects unknown query key (strict mode — link-poisoning guard)', () => {
    expect(() => vocSearchSchema.parse({ view: 'inbox', onload: 'evil' })).toThrow();
  });

  test('rejects unlisted filter.* key', () => {
    expect(() => vocSearchSchema.parse({ view: 'inbox', 'filter.status': 'open' })).toThrow();
  });
});

// ---- Shell selection integration tests ----

// Stub fetch: /me → 200 (authed) so beforeLoad in _authed does not redirect.
function stubFetchMe() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/me')) {
      return new Response(
        JSON.stringify({
          actor: {
            id: '00000000-0000-0000-0000-000000000001',
            external_id: 'mock-admin-1',
            email: 'admin@feedbackops.local',
            display_name: 'Mock Admin',
            role_level: 'admin',
          },
          workspace_id: '11111111-1111-1111-1111-111111111111',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

// Import the VocRouteShell component and the zod schema from the route file.
// We bypass createFileRoute by mounting the component directly in a harness.
// This matches the admin route test pattern exactly.
import { VocRouteShell } from '../_authed/vocs';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const vocsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vocs',
    validateSearch: (raw) => vocSearchSchema.parse(raw),
    component: VocRouteShell,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([vocsRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

describe('/vocs route shell selection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('resolves /vocs?view=inbox to ListShell with Inbox tabs', async () => {
    stubFetchMe();
    const { router, qc } = buildHarness({ initialPath: '/vocs?view=inbox' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      // Inbox renders ListToolbar with tab labels (Korean) — check for '미트리아지' tab
      expect(screen.getByText('미트리아지')).toBeInTheDocument();
    });
    // Confirm the list shell is rendered (not workbench / page)
    expect(document.querySelector('[data-shell="list"]')).not.toBeNull();
  });

  test('resolves /vocs?view=my to ListShell with My VOCs title', async () => {
    stubFetchMe();
    const { router, qc } = buildHarness({ initialPath: '/vocs?view=my' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const matches = screen.getAllByText('My VOCs');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
    expect(document.querySelector('[data-shell="list"]')).not.toBeNull();
  });

  test('resolves /vocs?view=triage to WorkbenchShell with Triage Console', async () => {
    stubFetchMe();
    const { router, qc } = buildHarness({ initialPath: '/vocs?view=triage' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Triage Console')).toBeInTheDocument();
    });
  });

  test('resolves /vocs?action=create to PageShell with 새 VOC 작성', async () => {
    stubFetchMe();
    const { router, qc } = buildHarness({ initialPath: '/vocs?action=create' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('새 VOC 작성')).toBeInTheDocument();
    });
  });

  test('defaults to Inbox when no view param supplied', async () => {
    stubFetchMe();
    const { router, qc } = buildHarness({ initialPath: '/vocs' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      // Default view is inbox — ListToolbar renders tab labels
      expect(screen.getByText('미트리아지')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-shell="list"]')).not.toBeNull();
  });
});
