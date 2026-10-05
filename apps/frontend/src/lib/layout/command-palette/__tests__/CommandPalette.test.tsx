import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homeSidebarEntries } from '@/features/home/homeNavigation';
import { NAV_TREE } from '@/routes/_authed';
import { navResolveResponseSchema } from '@fops/shared';
import { AppFrame } from '../../AppFrame';
import { CommandPalette } from '../CommandPalette';
import { CommandPaletteProvider, useCommandPalette } from '../CommandPaletteContext';

const originalFetch = globalThis.fetch;
const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
const originalUaData = Object.getOwnPropertyDescriptor(window.navigator, 'userAgentData');

const VOC_ID = '11111111-1111-4111-8111-111111111111';
const RESOLVE_BODY = navResolveResponseSchema.parse({
  entity_type: 'voc',
  id: VOC_ID,
  display_id: 'VOC-12',
  route_intent: { route: '/vocs', search: { view: 'inbox', selected: VOC_ID } },
});

const RESOLVE_CASES = [
  {
    name: 'VOC',
    displayId: 'VOC-12',
    response: RESOLVE_BODY,
  },
  {
    name: 'Finding',
    displayId: 'FIN-24',
    response: navResolveResponseSchema.parse({
      entity_type: 'finding',
      id: '22222222-2222-4222-8222-222222222222',
      display_id: 'FIN-24',
      route_intent: {
        route: '/findings',
        search: { selected: '22222222-2222-4222-8222-222222222222' },
      },
    }),
  },
  {
    name: 'Task Request',
    displayId: 'REQ-31',
    response: navResolveResponseSchema.parse({
      entity_type: 'task_request',
      id: '33333333-3333-4333-8333-333333333333',
      display_id: 'REQ-31',
      route_intent: {
        route: '/tasks',
        search: {
          view: 'requests',
          param: '33333333-3333-4333-8333-333333333333',
        },
      },
    }),
  },
  {
    name: 'Task',
    displayId: 'TASK-43',
    response: navResolveResponseSchema.parse({
      entity_type: 'task',
      id: '44444444-4444-4444-8444-444444444444',
      display_id: 'TASK-43',
      route_intent: {
        route: '/tasks',
        search: {
          view: 'board',
          param: '44444444-4444-4444-8444-444444444444',
        },
      },
    }),
  },
];

function stubPlatform(platform: string): void {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'userAgentData', {
    value: undefined,
    configurable: true,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function installFetch(handler: (url: string) => Response): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
    handler(String(input)),
  ) as unknown as typeof fetch;
}

function EmptyPaletteRoute(): React.ReactElement {
  return <div />;
}

function createPaletteRouter({
  canAccessWorkspaceAdmin = false,
  showHomeSidebar = false,
}: {
  canAccessWorkspaceAdmin?: boolean;
  showHomeSidebar?: boolean;
} = {}) {
  const root = createRootRoute({
    component: () => (
      <CommandPaletteProvider>
        {!showHomeSidebar && (
          <CommandPalette navTree={NAV_TREE} canAccessWorkspaceAdmin={canAccessWorkspaceAdmin} />
        )}
        <Outlet />
      </CommandPaletteProvider>
    ),
  });
  const keepSearch = (search: Record<string, unknown>) => search;
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: showHomeSidebar ? FrameHarness : EmptyPaletteRoute,
  });
  const vocs = createRoute({
    getParentRoute: () => root,
    path: '/vocs',
    validateSearch: keepSearch,
    component: EmptyPaletteRoute,
  });
  const findings = createRoute({
    getParentRoute: () => root,
    path: '/findings',
    validateSearch: keepSearch,
    component: EmptyPaletteRoute,
  });
  const tasks = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    validateSearch: keepSearch,
    component: EmptyPaletteRoute,
  });
  return createRouter({
    routeTree: root.addChildren([home, vocs, findings, tasks]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
}

async function renderPalette(options: Parameters<typeof createPaletteRouter>[0] = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createPaletteRouter(options);
  await router.load();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...rendered, router };
}

function pressShortcut(init: {
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
}): void {
  fireEvent.keyDown(window, { key: 'k', ...init });
}

// Mirrors the real AuthedShell wiring: the sidebar row's opener comes from the
// palette context above the frame.
function FrameHarness(): React.ReactElement {
  const { setOpen } = useCommandPalette();
  const open = React.useCallback(() => setOpen(true), [setOpen]);
  return (
    <AppFrame
      sidebarEntries={homeSidebarEntries(undefined, false, open)}
      activeDomain="home"
      paletteNavTree={NAV_TREE}
    >
      <div />
    </AppFrame>
  );
}

async function renderFrameWithSidebar(): Promise<void> {
  installFetch((url) => {
    if (url === '/me') {
      return jsonResponse(200, {
        actor: {
          id: VOC_ID,
          external_id: 'a',
          email: 'a@test',
          display_name: 'Actor',
          role_level: 'admin',
        },
        workspace_id: 'workspace',
      });
    }
    if (url === '/managed-systems') return jsonResponse(200, { items: [], total: 0 });
    if (url === '/nav/counts') return jsonResponse(200, { counts: {} });
    if (url.startsWith('/me/permissions/check')) return jsonResponse(200, { state: 'approved' });
    throw new Error(`unexpected request ${url}`);
  });
  await renderPalette({ showHomeSidebar: true });
}

beforeEach(() => {
  stubPlatform('Win32');
  installFetch(() => {
    throw new Error('unexpected request');
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPlatform) Object.defineProperty(window.navigator, 'platform', originalPlatform);
  if (originalUaData) Object.defineProperty(window.navigator, 'userAgentData', originalUaData);
  else Reflect.deleteProperty(window.navigator, 'userAgentData');
});

describe('CommandPalette shortcut', () => {
  it.each([
    { name: 'macOS opens with ⌘K', platform: 'MacIntel', modifier: { metaKey: true } },
    { name: 'Windows opens with Ctrl+K', platform: 'Win32', modifier: { ctrlKey: true } },
  ] as const)('$name', async ({ platform, modifier }) => {
    stubPlatform(platform);
    await renderPalette();

    pressShortcut(modifier);

    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    // Radix FocusScope moves focus to the first tabbable element — the input.
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it.each([
    { name: 'macOS ignores Ctrl+K', platform: 'MacIntel', modifier: { ctrlKey: true } },
    { name: 'Windows ignores ⌘K', platform: 'Win32', modifier: { metaKey: true } },
  ] as const)('$name', async ({ platform, modifier }) => {
    stubPlatform(platform);
    await renderPalette();

    pressShortcut(modifier);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the shortcut is pressed again', async () => {
    await renderPalette();

    pressShortcut({ ctrlKey: true });
    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    pressShortcut({ ctrlKey: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores the shortcut while an IME composition is active', async () => {
    await renderPalette();

    pressShortcut({ ctrlKey: true, isComposing: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the platform shortcut label in the footer', async () => {
    stubPlatform('MacIntel');
    await renderPalette();
    pressShortcut({ metaKey: true });

    expect(screen.getByTestId('command-palette-shortcut-hint')).toHaveTextContent('⌘K');
  });
});

describe('CommandPalette navigation commands', () => {
  it('routes to the entry href when a navigate command is selected', async () => {
    const { router } = await renderPalette();
    pressShortcut({ ctrlKey: true });

    // `my-vocs` is a NAV_TREE-only entry — the Inbox href dedupes to the rail item.
    fireEvent.click(screen.getByTestId('command-palette-item-nav-my-vocs'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
    expect(router.state.location.search).toEqual({ view: 'my' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('routes the VOC create command to the create action URL', async () => {
    const { router } = await renderPalette();
    pressShortcut({ ctrlKey: true });

    fireEvent.click(screen.getByTestId('command-palette-item-create-voc'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
    expect(router.state.location.search).toEqual({ action: 'create' });
  });

  it('qualifies destinations with their rail label and filters by that context', async () => {
    const user = userEvent.setup();
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'VOC');

    expect(screen.getByTestId('command-palette-item-nav-triage')).toHaveTextContent('VOC · Triage');
    expect(screen.getByTestId('command-palette-item-nav-high-severity')).toHaveTextContent(
      'VOC · 높음',
    );
    expect(screen.getByTestId('command-palette-item-nav-unassigned')).toHaveTextContent(
      'VOC · 미배정',
    );
    expect(screen.getByTestId('command-palette-item-nav-voc-clusters')).toHaveTextContent(
      'VOC · Clusters',
    );
    expect(screen.getByTestId('command-palette-item-nav-rail-voc')).toBeInTheDocument();
  });

  it('qualifies the Tasks board destination with its view label', async () => {
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    expect(screen.getByTestId('command-palette-item-nav-rail-tasks')).toHaveTextContent(
      'Tasks · Board',
    );
  });

  it('qualifies Task, Integration, and Admin destinations with their rail labels', async () => {
    await renderPalette({ canAccessWorkspaceAdmin: true });
    pressShortcut({ ctrlKey: true });

    expect(screen.getByTestId('command-palette-item-nav-my-tasks')).toHaveTextContent(
      'Tasks · 내 Task',
    );
    expect(screen.getByTestId('command-palette-item-nav-integration-links')).toHaveTextContent(
      '연동 · 엔티티 링크',
    );
    expect(screen.getByTestId('command-palette-item-nav-admin-permissions')).toHaveTextContent(
      '관리자 · 권한 요청',
    );
  });

  it('omits Admin commands without the workspace.admin approval', async () => {
    await renderPalette({ canAccessWorkspaceAdmin: false });
    pressShortcut({ ctrlKey: true });

    expect(screen.queryByTestId('command-palette-item-nav-rail-admin')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('command-palette-item-nav-admin-permissions'),
    ).not.toBeInTheDocument();
  });

  it('lists Admin commands when workspace.admin is approved', async () => {
    await renderPalette({ canAccessWorkspaceAdmin: true });
    pressShortcut({ ctrlKey: true });

    expect(screen.getByTestId('command-palette-item-nav-rail-admin')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-item-nav-admin-permissions')).toBeInTheDocument();
  });
});

describe('CommandPalette display-id flow', () => {
  function mockResolve(handler: () => Response): void {
    installFetch(() => handler());
  }

  it.each(RESOLVE_CASES)(
    'navigates to the schema-validated $name route intent only after selection',
    async ({ displayId, response }) => {
      const user = userEvent.setup();
      mockResolve(() => jsonResponse(200, response));
      const { router } = await renderPalette();
      pressShortcut({ ctrlKey: true });

      await user.type(screen.getByRole('combobox'), displayId.toLowerCase());

      expect(screen.getByTestId('command-palette-open-record')).toHaveTextContent(
        `${displayId} 열기`,
      );
      const resolveCalls = () =>
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
          String(call[0]).startsWith('/nav/resolve'),
        );
      expect(resolveCalls()).toHaveLength(0);

      fireEvent.click(screen.getByTestId('command-palette-open-record'));

      await waitFor(() => expect(router.state.location.pathname).toBe(response.route_intent.route));
      expect(router.state.location.search).toEqual(response.route_intent.search);
      expect(resolveCalls()).toHaveLength(1);
      expect(String(resolveCalls()[0]?.[0])).toBe(`/nav/resolve?display_id=${displayId}`);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('disables the 열기 item with a spinner while the resolve request is pending', async () => {
    const user = userEvent.setup();
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn(async () => pending) as unknown as typeof fetch;
    const { router } = await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'voc-12');
    fireEvent.click(screen.getByTestId('command-palette-open-record'));

    const item = screen.getByTestId('command-palette-open-record');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item.querySelector('.animate-spin')).not.toBeNull();

    release?.(jsonResponse(200, RESOLVE_BODY));
    await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
  });

  it.each([
    {
      name: 'success',
      response: jsonResponse(200, RESOLVE_BODY),
    },
    {
      name: '404',
      response: jsonResponse(404, { code: 'not_found.record', message: 'no such record' }),
    },
  ])('ignores a late $name response after close and reopen', async ({ response }) => {
    const user = userEvent.setup();
    let releaseResponse: ((value: Response) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      releaseResponse = resolve;
    });
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return pendingResponse;
    }) as unknown as typeof fetch;
    const { router } = await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'voc-12');
    fireEvent.click(screen.getByTestId('command-palette-open-record'));
    expect(screen.getByTestId('command-palette-open-record')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    pressShortcut({ ctrlKey: true });
    pressShortcut({ ctrlKey: true });
    await user.type(screen.getByRole('combobox'), 'voc-13');

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-open-record')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await act(async () => {
      releaseResponse?.(response);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(router.state.location.pathname).toBe('/home');
    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    expect(screen.queryByTestId('command-palette-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('command-palette-open-record')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows the inline not-found message and keeps the palette open', async () => {
    const user = userEvent.setup();
    mockResolve(() => jsonResponse(404, { code: 'not_found.record', message: 'no such record' }));
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'voc-99');
    fireEvent.click(screen.getByTestId('command-palette-open-record'));

    expect(await screen.findByTestId('command-palette-error')).toHaveTextContent(
      '해당 항목을 찾을 수 없거나 접근 권한이 없습니다.',
    );
    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
  });

  it('shows no 열기 group for a non-display-id query', async () => {
    const user = userEvent.setup();
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'hello');

    expect(screen.queryByTestId('command-palette-open-record')).not.toBeInTheDocument();
  });
});

describe('CommandPalette list chrome', () => {
  it('shows the empty state for a query with no matches', async () => {
    const user = userEvent.setup();
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), '제모녹ㅈ');

    expect(screen.getByTestId('command-palette-empty')).toHaveTextContent(
      '일치하는 명령이 없습니다.',
    );
    expect(screen.getByTestId('command-palette-count')).toHaveTextContent('0개 명령');
  });

  it('shows the visible item count in the footer', async () => {
    await renderPalette();
    pressShortcut({ ctrlKey: true });

    // The dialog portals to document.body — query there, not the render container.
    const visibleItems = document.querySelectorAll('[cmdk-item]').length;
    expect(visibleItems).toBeGreaterThan(0);
    expect(screen.getByTestId('command-palette-count')).toHaveTextContent(`${visibleItems}개 명령`);
  });

  it('resets the query when the palette reopens', async () => {
    const user = userEvent.setup();
    await renderPalette();
    pressShortcut({ ctrlKey: true });
    await user.type(screen.getByRole('combobox'), 'voc-12');
    pressShortcut({ ctrlKey: true });
    pressShortcut({ ctrlKey: true });

    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});

describe('CommandPalette sidebar row', () => {
  it('opens from the Home sidebar Command row, and Esc closes and restores focus to the row', async () => {
    const user = userEvent.setup();
    await renderFrameWithSidebar();

    const row = screen.getByTestId('sidebar-nav-command');
    expect(row).toHaveTextContent('Ctrl K');
    await user.click(row);

    const dialog = screen.getByRole('dialog', { name: '명령 메뉴' });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(row).toHaveFocus();
  });
});
