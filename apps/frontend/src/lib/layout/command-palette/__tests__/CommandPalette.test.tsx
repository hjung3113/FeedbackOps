import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homeSidebarEntries } from '@/features/home/homeNavigation';
import { NAV_TREE } from '@/routes/_authed';
import { navResolveResponseSchema } from '@fops/shared';
import { AppFrame } from '../../AppFrame';
import { CommandPalette } from '../CommandPalette';
import { CommandPaletteProvider, useCommandPalette } from '../CommandPaletteContext';

// vi.mock factories are hoisted; create the double inside vi.hoisted.
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));

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

function renderPalette({
  canAccessWorkspaceAdmin = false,
}: { canAccessWorkspaceAdmin?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPaletteProvider>
        <CommandPalette navTree={NAV_TREE} canAccessWorkspaceAdmin={canAccessWorkspaceAdmin} />
      </CommandPaletteProvider>
    </QueryClientProvider>,
  );
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

function renderFrameWithSidebar(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  render(
    <QueryClientProvider client={queryClient}>
      <CommandPaletteProvider>
        <FrameHarness />
      </CommandPaletteProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigate.mockReset();
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
  ] as const)('$name', ({ platform, modifier }) => {
    stubPlatform(platform);
    renderPalette();

    pressShortcut(modifier);

    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    // Radix FocusScope moves focus to the first tabbable element — the input.
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it.each([
    { name: 'macOS ignores Ctrl+K', platform: 'MacIntel', modifier: { ctrlKey: true } },
    { name: 'Windows ignores ⌘K', platform: 'Win32', modifier: { metaKey: true } },
  ] as const)('$name', ({ platform, modifier }) => {
    stubPlatform(platform);
    renderPalette();

    pressShortcut(modifier);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the shortcut is pressed again', () => {
    renderPalette();

    pressShortcut({ ctrlKey: true });
    expect(screen.getByRole('dialog', { name: '명령 메뉴' })).toBeInTheDocument();
    pressShortcut({ ctrlKey: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores the shortcut while an IME composition is active', () => {
    renderPalette();

    pressShortcut({ ctrlKey: true, isComposing: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the platform shortcut label in the footer', () => {
    stubPlatform('MacIntel');
    renderPalette();
    pressShortcut({ metaKey: true });

    expect(screen.getByTestId('command-palette-shortcut-hint')).toHaveTextContent('⌘K');
  });
});

describe('CommandPalette navigation commands', () => {
  it('routes to the entry href when a navigate command is selected', async () => {
    renderPalette();
    pressShortcut({ ctrlKey: true });

    // `my-vocs` is a NAV_TREE-only entry — the Inbox href dedupes to the rail item.
    fireEvent.click(screen.getByTestId('command-palette-item-nav-my-vocs'));

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({ to: '/vocs', search: { view: 'my' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('routes the VOC create command to the create action URL', () => {
    renderPalette();
    pressShortcut({ ctrlKey: true });

    fireEvent.click(screen.getByTestId('command-palette-item-create-voc'));

    expect(navigate).toHaveBeenCalledWith({ to: '/vocs', search: { action: 'create' } });
  });

  it('omits Admin commands without the workspace.admin approval', () => {
    renderPalette({ canAccessWorkspaceAdmin: false });
    pressShortcut({ ctrlKey: true });

    expect(screen.queryByTestId('command-palette-item-nav-rail-admin')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('command-palette-item-nav-admin-permissions'),
    ).not.toBeInTheDocument();
  });

  it('lists Admin commands when workspace.admin is approved', () => {
    renderPalette({ canAccessWorkspaceAdmin: true });
    pressShortcut({ ctrlKey: true });

    expect(screen.getByTestId('command-palette-item-nav-rail-admin')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-item-nav-admin-permissions')).toBeInTheDocument();
  });
});

describe('CommandPalette display-id flow', () => {
  function mockResolve(handler: () => Response): void {
    installFetch(() => handler());
  }

  it('shows an 열기 item for a display-id query and resolves it on selection', async () => {
    const user = userEvent.setup();
    mockResolve(() => jsonResponse(200, RESOLVE_BODY));
    renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'voc-12');

    expect(screen.getByTestId('command-palette-open-record')).toHaveTextContent('VOC-12 열기');
    fireEvent.click(screen.getByTestId('command-palette-open-record'));

    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const resolveCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
      String(call[0]).startsWith('/nav/resolve'),
    );
    expect(resolveCalls).toHaveLength(1);
    expect(String(resolveCalls[0]?.[0])).toBe('/nav/resolve?display_id=VOC-12');
    expect(navigate).toHaveBeenCalledWith({
      to: '/vocs',
      search: { view: 'inbox', selected: VOC_ID },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the 열기 item with a spinner while the resolve request is pending', async () => {
    const user = userEvent.setup();
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = vi.fn(async () => pending) as unknown as typeof fetch;
    renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'voc-12');
    fireEvent.click(screen.getByTestId('command-palette-open-record'));

    const item = screen.getByTestId('command-palette-open-record');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item.querySelector('.animate-spin')).not.toBeNull();

    release?.(jsonResponse(200, RESOLVE_BODY));
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  });

  it('shows the inline not-found message and keeps the palette open', async () => {
    const user = userEvent.setup();
    mockResolve(() => jsonResponse(404, { code: 'not_found.record', message: 'no such record' }));
    renderPalette();
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
    renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), 'hello');

    expect(screen.queryByTestId('command-palette-open-record')).not.toBeInTheDocument();
  });
});

describe('CommandPalette list chrome', () => {
  it('shows the empty state for a query with no matches', async () => {
    const user = userEvent.setup();
    renderPalette();
    pressShortcut({ ctrlKey: true });

    await user.type(screen.getByRole('combobox'), '제모녹ㅈ');

    expect(screen.getByTestId('command-palette-empty')).toHaveTextContent(
      '일치하는 명령이 없습니다.',
    );
    expect(screen.getByTestId('command-palette-count')).toHaveTextContent('0개 명령');
  });

  it('shows the visible item count in the footer', () => {
    renderPalette();
    pressShortcut({ ctrlKey: true });

    // The dialog portals to document.body — query there, not the render container.
    const visibleItems = document.querySelectorAll('[cmdk-item]').length;
    expect(visibleItems).toBeGreaterThan(0);
    expect(screen.getByTestId('command-palette-count')).toHaveTextContent(`${visibleItems}개 명령`);
  });

  it('resets the query when the palette reopens', async () => {
    const user = userEvent.setup();
    renderPalette();
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
    renderFrameWithSidebar();

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
