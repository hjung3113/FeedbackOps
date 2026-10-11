import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import type { VocListItem } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { installListMotionEnvironment } from '../../components/triage/__tests__/list-motion-environment';
import { TriageRoute } from '../TriageRoute';

const rows: VocListItem[] = [1, 2, 3, 4].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  display_id: `VOC-${n}`,
  title: `Queue item ${n}`,
  primary_managed_system_id: 'scope-a',
  analytics_area_id: null,
  reporter_id: 'reporter',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
}));

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
let environment: ReturnType<typeof installListMotionEnvironment>;
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  environment.restore();
});

function mount() {
  environment = installListMotionEnvironment();
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const processed = new Set<string>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/me/permissions/check')
        return json({ state: 'approved', decision: { allow: true } });
      if (init?.method === 'PATCH') {
        processed.add(url.pathname.split('/')[2] as string);
        return json({ updated_at: '2026-01-02T00:00:00.000Z' });
      }
      if (url.pathname === '/vocs') {
        if (
          url.searchParams.get('tab') === 'high' ||
          url.searchParams.get('managed_system_id') === 'scope-b'
        )
          return pending;
        return json({ items: rows.filter((row) => !processed.has(row.id)) });
      }
      if (url.pathname === '/nav/counts') return json({ counts: { 'voc.triage': rows.length } });
      return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
    }),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY_KEY, {
    actor: { id: 'admin', role_level: 'admin' },
    workspace_id: 'ws',
  });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/vocs',
    validateSearch: (search: Record<string, unknown>) => search,
    component: TriageRoute,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [`/vocs?view=triage&tab=untriaged&selected=${rows[1]?.id}`],
    }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, resolve };
}

it.each(['tab', 'scope'] as const)(
  'does not animate a %s switch or its deferred rows',
  async (context) => {
    const { router, resolve } = mount();
    await screen.findByRole('button', { name: /VOC-1/ });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    environment.animate.mockClear();
    if (context === 'tab') fireEvent.mouseDown(screen.getByRole('tab', { name: /높음/ }));
    else
      await act(async () => {
        await router.navigate({
          to: '/vocs',
          search: (prev) => ({ ...prev, managedSystem: 'scope-b' }),
        });
      });
    await screen.findByText('불러오는 중…');
    await act(async () => {});
    expect(environment.animate).not.toHaveBeenCalled();
    await act(async () => {
      resolve(json({ items: rows.slice(2) }));
    });
    await screen.findByRole('button', { name: /VOC-3/ });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => {});
    expect(environment.animate).not.toHaveBeenCalled();
  },
);

it('animates same-context optimistic removal while retaining queue scroll and selection advance', async () => {
  mount();
  await screen.findByRole('heading', { name: 'Queue item 2' });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const row = screen.getByRole('button', { name: /VOC-2/ });
  const container = row.parentElement as HTMLElement;
  container.scrollTop = 123;
  environment.animate.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '낮음' }));
  fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));
  await waitFor(() => expect(environment.animate).toHaveBeenCalled());
  await screen.findByRole('heading', { name: 'Queue item 3' });
  expect(screen.getByRole('button', { name: /VOC-3/ }).parentElement).toBe(container);
  expect(container.scrollTop).toBe(123);
});

it('skips stale cached tab refresh motion, then preserves motion and scroll for settled-context removal', async () => {
  const { resolve } = mount();
  const fetch = globalThis.fetch;
  let cachedTabRequested = false;
  const processed = new Set<string>();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'PATCH') processed.add(url.pathname.split('/')[2] as string);
    if (url.pathname === '/vocs' && url.searchParams.get('tab') === 'high') {
      if (cachedTabRequested) {
        return json({ items: rows.slice(1).filter((row) => !processed.has(row.id)) });
      }
      cachedTabRequested = true;
    }
    return fetch(input, init);
  });
  await screen.findByRole('heading', { name: 'Queue item 2' });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  client.setQueryData(
    ['vocs', 'triage', undefined, 'high', undefined, undefined, undefined, undefined, undefined],
    { items: rows },
    { updatedAt: Date.now() - 60_000 },
  );
  environment.animate.mockClear();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /높음/ }));
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /높음/ })).toHaveAttribute('aria-selected', 'true');
    expect(client.isFetching({ queryKey: ['vocs', 'triage'] })).toBeGreaterThan(0);
  });
  expect(screen.getByRole('button', { name: /VOC-1/ })).toBeInTheDocument();
  await act(async () => {});
  expect(environment.animate).not.toHaveBeenCalled();
  await act(async () => {
    resolve(json({ items: rows.slice(1) }));
  });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(async () => {});
  expect(environment.animate).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /VOC-1/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /VOC-2/ }));
  await screen.findByRole('heading', { name: 'Queue item 2' });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const container = screen.getByRole('button', { name: /VOC-2/ }).parentElement as HTMLElement;
  container.scrollTop = 123;
  fireEvent.click(screen.getByRole('button', { name: '낮음' }));
  fireEvent.click(screen.getByRole('button', { name: /Triage 확정/ }));
  await waitFor(() => expect(environment.animate).toHaveBeenCalled());
  await screen.findByRole('heading', { name: 'Queue item 3' });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.getByRole('button', { name: /VOC-3/ }).parentElement).toBe(container);
  expect(container.scrollTop).toBe(123);
});
