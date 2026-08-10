import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above module-level const declarations, so the
// doubles have to be created inside vi.hoisted or the factories close over
// uninitialised bindings.
const { navigate, logout, useMe } = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(),
  useMe: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/api/auth', () => ({ logout }));
vi.mock('@/lib/auth/useMe', () => ({ useMe }));

import { AppRail, railForPathname } from '../AppRail';

const ACTOR = {
  actor: {
    id: 'actor-1',
    external_id: 'actor-1',
    email: 'jiwon@example.test',
    display_name: '김지원',
    role_level: 'admin',
  },
  workspace_id: 'workspace-1',
};

function renderRail(props: ComponentProps<typeof AppRail> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppRail {...props} />
    </QueryClientProvider>,
  );
  return queryClient;
}

// The menu is opened with the keyboard on purpose. Radix's trigger opens on
// `pointerdown`, which jsdom cannot synthesise convincingly — measured here:
// fireEvent.pointerDown leaves aria-expanded="false", while Enter flips it to
// "true". Driving it by keyboard is both the interaction that works in this
// environment and the one worth asserting: a logout that only pointers can
// reach is the same accessibility failure as #335's native prompt.
function openAccountMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Profile' }), { key: 'Enter' });
}

beforeEach(() => {
  navigate.mockReset();
  logout.mockReset();
  useMe.mockReturnValue({ data: ACTOR });
});

describe('AppRail', () => {
  it.each([
    ['/home', 'home'],
    ['/vocs?view=inbox', 'voc'],
    ['/voc-clusters', 'voc'],
    ['/findings', 'findings'],
    ['/tasks?view=board', 'tasks'],
    ['/integration/links', 'integration'],
    ['/surveys', 'surveys'],
    ['/admin/settings', 'admin'],
  ] as const)('marks %s as the active %s rail', (pathname, domain) => {
    renderRail({ activeDomain: railForPathname(pathname) });
    expect(screen.getByTestId(`rail-${domain}`)).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Home as the first rail entry', () => {
    expect(screen.queryByTestId('rail-home')).toBeNull();
    renderRail({ activeDomain: 'home' });
    const railButtons = screen.getAllByRole('link');
    expect(railButtons[0]).toHaveAttribute('data-testid', 'rail-home');
  });
});

describe('AppRail account menu', () => {
  it('shows logout after opening the avatar menu', () => {
    renderRail();
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('revokes once, then clears cached data and routes to login', async () => {
    const calls: string[] = [];
    logout.mockImplementation(async () => {
      calls.push('logout');
    });
    navigate.mockImplementation(() => {
      calls.push('navigate');
    });
    const queryClient = renderRail();
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      calls.push('clear');
    });

    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }));
    expect(logout).toHaveBeenCalledOnce();
    expect(queryClient.clear).toHaveBeenCalledOnce();
    expect(calls).toEqual(['logout', 'clear', 'navigate']);
  });

  it('clears cached data and routes to login when revocation fails', async () => {
    logout.mockRejectedValue(new Error('network failed'));
    const queryClient = renderRail();
    const clear = vi.spyOn(queryClient, 'clear');

    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('re-enables logout when the route change itself fails', async () => {
    // Without this the item stays disabled for the rest of the session and the
    // user is stranded on a screen whose session has already been revoked.
    logout.mockResolvedValue(undefined);
    navigate.mockRejectedValue(new Error('route failed'));
    renderRail();

    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    openAccountMenu();
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: '로그아웃' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
  });

  it('shows the Actor display name and Role Level in the account menu', () => {
    renderRail();
    openAccountMenu();
    expect(screen.getByText('김지원 · Admin')).toBeInTheDocument();
  });

  // Both /me shapes that omit an actor, not just the unresolved one. The
  // second case is the one that actually crashed the frame: `data` present,
  // `data.actor` absent — the same response AppFrame.scope.test.tsx exercises.
  it.each([
    ['no data at all', undefined],
    ['data without an actor', { workspace_id: 'workspace-1' }],
  ])('keeps logout available when Actor data is unavailable (%s)', (_label, data) => {
    useMe.mockReturnValue({ data });
    renderRail();
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByText('김지원 · Admin')).not.toBeInTheDocument();
  });
});
