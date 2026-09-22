// /login route guards per F-015:
//   - DEV (default in vitest): renders the mock-login picker including the
//     seed roster external_ids.
//   - PROD (import.meta.env.PROD): starts backend OIDC login once and shows
//     the redirect message. Seed roster strings must not leak.

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
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { sanitizeLoginReturnTo } from '../lib/login-return-to';
import { LoginPage } from './login';

function buildHarness({ initialPath }: { initialPath: string }) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Root entry</p>,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { router, qc };
}

function spyOnLocationReplace(search = '') {
  // jsdom's Location is non-configurable; replace only the window facade.
  const location = { ...window.location, search, replace: (_url: string) => {} };
  const replace = vi.spyOn(location, 'replace').mockImplementation(() => {});
  vi.stubGlobal(
    'window',
    new Proxy(window, {
      get(target, property) {
        return property === 'location' ? location : Reflect.get(target, property);
      },
    }),
  );
  return replace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/login dev (mock auth)', () => {
  test('renders mock-login picker with seed actors', async () => {
    // Default vitest env: PROD=false. No env stub needed.
    const replace = spyOnLocationReplace();
    globalThis.fetch = vi.fn(async () => new Response('not mocked', { status: 500 })) as typeof globalThis.fetch;

    const { router, qc } = buildHarness({ initialPath: '/login' });
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mock login' })).toBeInTheDocument();
    });
    const expectedNames = new Set(['Mock Admin', 'Mock Admin Two', 'Mock Developer One', 'Mock Developer Two', 'Mock User', 'Mock User Two']);
    const renderedNames = new Set(screen.getAllByRole('button').map((button) => button.textContent?.replace(/ \((Admin|Developer|User)\)$/, '') ?? ''));
    expect(renderedNames, `missing actor names: ${[...expectedNames].filter((name) => !renderedNames.has(name)).join(', ')}`).toEqual(expectedNames);
    expect(replace).not.toHaveBeenCalled();
  });

  test('sends distinct external ids for developer and admin cards', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ actor: { id: 'actor', external_id: JSON.parse(String(init?.body)).external_id, email: 'actor@example.test', display_name: 'Actor', role_level: 'developer' }, workspace_id: 'workspace' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const first = buildHarness({ initialPath: '/login' });
    const { unmount } = render(<QueryClientProvider client={first.qc}><RouterProvider router={first.router} /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Mock Developer One (Developer)' });
    fireEvent.click(screen.getByRole('button', { name: 'Mock Developer One (Developer)' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/auth/mock-login', expect.objectContaining({ body: JSON.stringify({ external_id: 'mock-developer-1' }) })));
    unmount();

    const second = buildHarness({ initialPath: '/login' });
    render(<QueryClientProvider client={second.qc}><RouterProvider router={second.router} /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Mock Admin (Admin)' });
    fireEvent.click(screen.getByRole('button', { name: 'Mock Admin (Admin)' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/auth/mock-login', expect.objectContaining({ body: JSON.stringify({ external_id: 'mock-admin-1' }) })));
    expect(fetchMock).toHaveBeenCalledWith('/auth/mock-login', expect.objectContaining({ body: JSON.stringify({ external_id: 'mock-developer-1' }) }));
  });

  test('clears cached data before routing after mock login succeeds', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ actor: { id: 'actor', external_id: 'mock-user-1', email: 'user@example.test', display_name: 'Mock User', role_level: 'user' }, workspace_id: 'workspace' }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
    const { router, qc } = buildHarness({ initialPath: '/login' });
    vi.spyOn(qc, 'clear').mockImplementation(() => { calls.push('clear'); });
    const originalNavigate = router.navigate.bind(router);
    vi.spyOn(router, 'navigate').mockImplementation((options) => {
      calls.push('navigate');
      return originalNavigate(options);
    });
    const invalidateQueries = vi.spyOn(qc, 'invalidateQueries');

    render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Mock User (User)' });
    fireEvent.click(screen.getByRole('button', { name: 'Mock User (User)' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(qc.clear).toHaveBeenCalledOnce();
    expect(calls).toEqual(['clear', 'navigate']);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

const unsafeReturnTargets = [
  '//evil.com',
  'https://evil.com',
  '\\evil',
  '/\\evil',
  '/a b',
  ' /home',
  '/home ',
  '/\t/evil.com',
  '/home\n',
  '/home\r',
  '/\u0000',
  '/\u001f',
  '/\u007f',
  '/\u0085',
  '/\u009f',
  '/a/..//evil.com',
  '/%2e%2e//evil.com',
  `/${'a'.repeat(2048)}`,
  '',
];

describe('sanitizeLoginReturnTo', () => {
  test.each([
    '/',
    '/home',
    '/tasks?view=board&selected=task-1#details',
    '/vocs?q=%20',
    `/${'a'.repeat(2047)}`,
  ])('preserves a safe target unchanged: %s', (target) => {
    expect(sanitizeLoginReturnTo(target)).toBe(target);
  });

  test.each([undefined, null, ...unsafeReturnTargets])(
    'defaults an unsafe or absent target: %s',
    (target) => {
      expect(sanitizeLoginReturnTo(target)).toBe('/home');
    },
  );
});

describe('/login prod guard (F-015)', () => {
  test('starts OIDC once across StrictMode effects and rerenders without exposing the picker', () => {
    vi.stubEnv('PROD', true);
    const replace = spyOnLocationReplace();
    const { rerender } = render(
      <StrictMode><LoginPage /></StrictMode>,
    );
    rerender(<StrictMode><LoginPage /></StrictMode>);

    expect(screen.getByText('로그인 페이지로 이동 중…')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/auth/login?return_to=%2Fhome');
    expect(screen.queryByRole('heading', { name: 'Mock login' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mock Admin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mock User/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock-admin-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock-developer-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock-user-1/)).not.toBeInTheDocument();
  });

  test.each(['redirectTo', 'return_to', 'redirect'])('forwards a safe %s unchanged and encoded', (key) => {
    vi.stubEnv('PROD', true);
    const target = '/tasks?view=board&selected=task-1#details';
    const replace = spyOnLocationReplace(`?${key}=${encodeURIComponent(target)}`);
    render(<LoginPage />);

    expect(screen.getByText('로그인 페이지로 이동 중…')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(`/auth/login?return_to=${encodeURIComponent(target)}`);
  });

  test.each(unsafeReturnTargets)('uses /home for an unsafe return_to: %s', (target) => {
    vi.stubEnv('PROD', true);
    const replace = spyOnLocationReplace(`?return_to=${encodeURIComponent(target)}`);
    render(<LoginPage />);

    expect(screen.getByText('로그인 페이지로 이동 중…')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/auth/login?return_to=%2Fhome');
  });
});
