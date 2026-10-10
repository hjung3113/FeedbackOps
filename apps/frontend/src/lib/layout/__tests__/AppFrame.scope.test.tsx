import { permissionCheckQueryKey } from '@/lib/cross-system/usePermissionCheck';
import { NAV_TREE } from '@/routes/_authed';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppFrame } from '../AppFrame';

const MS_ONE = '11111111-1111-4111-8111-111111111111';
const MS_TWO = '22222222-2222-4222-8222-222222222222';
const MS_THREE = '33333333-3333-4333-8333-333333333333';

const NAV_ACTORS = [
  {
    name: 'reporter without grants',
    roleLevel: 'user',
    managedSystemIds: [],
    canUseWorkspaceAdmin: false,
  },
  {
    name: 'developer with per-system grants',
    roleLevel: 'developer',
    managedSystemIds: [MS_ONE, MS_TWO],
    canUseWorkspaceAdmin: false,
  },
  {
    name: 'partial-scope operator',
    roleLevel: 'developer',
    managedSystemIds: [MS_ONE],
    canUseWorkspaceAdmin: false,
  },
  { name: 'admin', roleLevel: 'admin', managedSystemIds: [], canUseWorkspaceAdmin: true },
] as const;

describe('AppFrame managed-system scope', () => {
  it('re-fetches nav counts with managed_system_id after scope selection', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === '/me')
        return json({
          actor: {
            id: 'actor',
            external_id: 'actor',
            email: 'actor@test',
            display_name: 'Actor',
            role_level: 'admin',
          },
          workspace_id: 'workspace',
        });
      if (url === '/managed-systems')
        return json({
          items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')],
          total: 2,
        });
      if (url.startsWith('/nav/counts')) return json({ counts: { 'voc.inbox': 0 } });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <AppFrame
          activeDomain="voc"
          sidebarEntries={[
            { id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox', countKey: 'voc.inbox' },
          ]}
        >
          content
        </AppFrame>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(requestedUrls).toContain('/managed-systems'));
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(await screen.findByTestId(`scope-option-${MS_TWO}`));
    await waitFor(() => expect(requestedUrls).toContain(`/nav/counts?managed_system_id=${MS_TWO}`));
    globalThis.fetch = originalFetch;
  });

  it('#518 disables the scope selector on a route that does not support Managed System scope', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/me')
        return json({
          actor: {
            id: 'actor',
            external_id: 'actor',
            email: 'actor@test',
            display_name: 'Actor',
            role_level: 'admin',
          },
          workspace_id: 'workspace',
        });
      if (url === '/managed-systems')
        return json({ items: [managedSystem(MS_ONE, 'Identity')], total: 1 });
      if (url.startsWith('/nav/counts')) return json({ counts: {} });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <AppFrame activeDomain="admin" scopeControlEnabled={false} sidebarEntries={[]}>
            content
          </AppFrame>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
      expect(screen.getByTestId('scope-selector')).toBeDisabled();
      expect(screen.getByTestId('scope-selector')).toHaveTextContent('워크스페이스 전체');
      fireEvent.click(screen.getByTestId('scope-selector'));
      expect(screen.queryByTestId('scope-option-all')).not.toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders non-admin scope options when /me omits actor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/me') return json({});
      if (url === '/managed-systems')
        return json({
          items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')],
          total: 2,
        });
      if (url === '/nav/counts') return json({ counts: {} });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    try {
      render(
        <QueryClientProvider client={client}>
          <AppFrame activeDomain="voc" sidebarEntries={[]}>
            content
          </AppFrame>
        </QueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('scope-selector'));

      expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
      expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(
        '전체 Managed System, 내 담당 범위',
      );
      expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();
      expect(await screen.findByTestId(`scope-option-${MS_ONE}`)).toBeInTheDocument();
      expect(await screen.findByTestId(`scope-option-${MS_TWO}`)).toBeInTheDocument();
      // The denominator comes from the loaded system list, so this has to be
      // asserted after the options render — before that it is legitimately 0/0.
      expect(screen.getByTestId('scope-option-all')).toHaveTextContent('내 담당 0 / 2');
      expect(screen.getByTestId('scope-option-all')).toHaveTextContent('전체 Managed System');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses one scope request and dims only systems absent from the returned scope', async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === '/me')
        return json({
          actor: {
            id: 'actor',
            external_id: 'actor',
            email: 'actor@test',
            display_name: 'Actor',
            role_level: 'developer',
          },
          workspace_id: 'workspace',
        });
      if (url === '/managed-systems')
        return json({
          items: [
            managedSystem(MS_ONE, 'Identity'),
            managedSystem(MS_TWO, 'Finance'),
            managedSystem(MS_THREE, 'Sales'),
          ],
          total: 3,
        });
      if (url === '/me/permissions/scope?capability=voc.read')
        return json({ scope: { kind: 'scoped', managed_system_ids: [MS_TWO] } });
      if (url === '/nav/counts') return json({ counts: {} });
      if (url === '/saved-views?surface=voc') return json({ items: [] });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <AppFrame activeDomain="voc" sidebarEntries={[]}>
            content
          </AppFrame>
        </QueryClientProvider>,
      );
      await waitFor(() =>
        expect(
          requestedUrls.filter((url) => url === '/me/permissions/scope?capability=voc.read'),
        ).toHaveLength(1),
      );
      // #612 adds one workspace.admin check for the Admin navigation; the scope selector
      // itself still makes no per-system permission checks.
      expect(
        requestedUrls.filter(
          (url) =>
            url.startsWith('/me/permissions/check') && !url.includes('capability=workspace.admin'),
        ),
      ).toHaveLength(0);
      expect(
        requestedUrls.filter((u) => u === '/me/permissions/check?capability=workspace.admin'),
      ).toHaveLength(1);
      fireEvent.click(screen.getByTestId('scope-selector'));
      expect(await screen.findAllByLabelText('범위 밖')).toHaveLength(2);
      expect(
        screen.getByTestId(`scope-option-${MS_TWO}`).querySelector('[aria-label="범위 밖"]'),
      ).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not dim any system when the returned scope is all', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/me')
        return json({
          actor: {
            id: 'actor',
            external_id: 'actor',
            email: 'actor@test',
            display_name: 'Actor',
            role_level: 'developer',
          },
          workspace_id: 'workspace',
        });
      if (url === '/managed-systems')
        return json({
          items: [
            managedSystem(MS_ONE, 'Identity'),
            managedSystem(MS_TWO, 'Finance'),
            managedSystem(MS_THREE, 'Sales'),
          ],
          total: 3,
        });
      if (url === '/me/permissions/scope?capability=voc.read')
        return json({ scope: { kind: 'all' } });
      if (url === '/nav/counts') return json({ counts: {} });
      if (url === '/saved-views?surface=voc') return json({ items: [] });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <AppFrame activeDomain="voc" sidebarEntries={[]}>
            content
          </AppFrame>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('scope-selector'));
      expect(await screen.findAllByTestId(/^scope-option-[0-9]/)).toHaveLength(3);
      await waitFor(() => expect(screen.queryByLabelText('범위 밖')).not.toBeInTheDocument());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('AppFrame capability navigation', () => {
  it.each(NAV_ACTORS)(
    'keeps domain destinations visible and gates Admin navigation for $name',
    async (actor) => {
      const requestedUrls: string[] = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/me')
          return json({
            actor: {
              id: actor.name,
              external_id: actor.name,
              email: 'actor@test',
              display_name: 'Actor',
              role_level: actor.roleLevel,
            },
            workspace_id: 'workspace',
          });
        if (url === '/me/permissions/check?capability=workspace.admin')
          return json({
            state: actor.canUseWorkspaceAdmin ? 'approved' : 'request_access',
            decision: { allow: actor.canUseWorkspaceAdmin },
          });
        if (url === '/me/permissions/scope?capability=voc.read')
          return json({ scope: { kind: 'scoped', managed_system_ids: actor.managedSystemIds } });
        if (url === '/managed-systems')
          return json({
            items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')],
            total: 2,
          });
        if (url.startsWith('/nav/counts')) return json({ counts: {} });
        if (url.startsWith('/saved-views')) return json({ items: [] });
        if (url.startsWith('/notifications?'))
          return json({ items: [], page: { has_more: false }, unread_count: 0 });
        throw new Error(`unexpected request ${url}`);
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock as typeof globalThis.fetch;
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { unmount } = render(
        <QueryClientProvider client={client}>
          <AppFrame
            activeDomain="voc"
            sidebarEntries={[
              { id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox', section: 'VOC' },
              ...NAV_TREE.admin,
            ]}
          >
            content
          </AppFrame>
        </QueryClientProvider>,
      );

      try {
        await waitFor(() =>
          expect(requestedUrls).toContain('/me/permissions/check?capability=workspace.admin'),
        );
        await waitFor(() =>
          expect(
            client.getQueryState(permissionCheckQueryKey({ capability: 'workspace.admin' }))
              ?.status,
          ).toBe('success'),
        );

        for (const label of ['홈', 'VOC', 'Findings', 'Tasks', '연동', 'Surveys']) {
          expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
        }
        expect(screen.getByTestId('sidebar-nav-inbox')).toBeInTheDocument();

        if (actor.canUseWorkspaceAdmin) {
          expect(screen.getByRole('link', { name: '관리자' })).toBeInTheDocument();
          expect(screen.getByTestId('sidebar-section-admin')).toBeInTheDocument();
          for (const id of [
            'admin-ms',
            'admin-aa',
            'admin-permissions',
            'admin-permission-grants',
            'admin-settings',
          ]) {
            expect(screen.getByTestId(`sidebar-nav-${id}`)).toBeInTheDocument();
          }
          expect(screen.getByTestId('sidebar-footer-workspace-settings')).toBeInTheDocument();
        } else {
          expect(screen.queryByRole('link', { name: '관리자' })).not.toBeInTheDocument();
          expect(screen.queryByTestId('sidebar-section-admin')).not.toBeInTheDocument();
          for (const id of [
            'admin-ms',
            'admin-aa',
            'admin-permissions',
            'admin-permission-grants',
            'admin-settings',
          ]) {
            expect(screen.queryByTestId(`sidebar-nav-${id}`)).not.toBeInTheDocument();
          }
          expect(screen.queryByTestId('sidebar-footer-workspace-settings')).not.toBeInTheDocument();
        }
      } finally {
        unmount();
        globalThis.fetch = originalFetch;
      }
    },
  );

  it('does not show Admin navigation while the workspace capability check is loading', async () => {
    let resolveAdminCheck: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/me')
        return json({
          actor: {
            id: 'admin',
            external_id: 'admin',
            email: 'admin@test',
            display_name: 'Admin',
            role_level: 'admin',
          },
          workspace_id: 'workspace',
        });
      if (url === '/me/permissions/check?capability=workspace.admin')
        return new Promise<Response>((resolve) => {
          resolveAdminCheck = resolve;
        });
      if (url === '/managed-systems') return json({ items: [], total: 0 });
      if (url.startsWith('/nav/counts')) return json({ counts: {} });
      if (url.startsWith('/saved-views')) return json({ items: [] });
      if (url.startsWith('/notifications?'))
        return json({ items: [], page: { has_more: false }, unread_count: 0 });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <AppFrame activeDomain="admin" sidebarEntries={NAV_TREE.admin}>
          content
        </AppFrame>
      </QueryClientProvider>,
    );

    try {
      await waitFor(() => expect(resolveAdminCheck).toBeTypeOf('function'));
      expect(screen.queryByTestId('rail-admin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sidebar-nav-admin-ms')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sidebar-footer-workspace-settings')).not.toBeInTheDocument();

      await act(async () => {
        resolveAdminCheck?.(json({ state: 'approved', decision: { allow: true } }));
      });

      expect(await screen.findByTestId('rail-admin')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-nav-admin-ms')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-footer-workspace-settings')).toBeInTheDocument();
    } finally {
      unmount();
      globalThis.fetch = originalFetch;
    }
  });
});

describe('AppFrame saved-view surface scoping (#870)', () => {
  it.each(['home', 'surveys', 'integration', 'admin'] as const)(
    'does not fetch or render saved views on the %s domain',
    async (domain) => {
      const requestedUrls: string[] = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/me')
          return json({
            actor: {
              id: 'actor',
              external_id: 'actor',
              email: 'actor@test',
              display_name: 'Actor',
              role_level: 'admin',
            },
            workspace_id: 'workspace',
          });
        if (url === '/managed-systems') return json({ items: [], total: 0 });
        if (url.startsWith('/nav/counts')) return json({ counts: {} });
        // A VOC view exists server-side; only the surface-scoped request may see it.
        if (url === '/saved-views?surface=voc')
          return json({
            items: [
              {
                id: 'view-voc',
                surface: 'voc',
                name: 'received 검색',
                filter: { view: 'inbox', q: 'received' },
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
              },
            ],
          });
        throw new Error(`unexpected request ${url}`);
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock as typeof globalThis.fetch;
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { unmount } = render(
        <QueryClientProvider client={client}>
          <AppFrame activeDomain={domain} sidebarEntries={[]}>
            content
          </AppFrame>
        </QueryClientProvider>,
      );
      try {
        await waitFor(() => expect(requestedUrls).toContain('/managed-systems'));
        await act(async () => {
          await Promise.resolve();
        });
        expect(requestedUrls.filter((url) => url.startsWith('/saved-views'))).toEqual([]);
        expect(screen.queryByTestId('saved-views-section')).not.toBeInTheDocument();
      } finally {
        unmount();
        globalThis.fetch = originalFetch;
      }
    },
  );
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function managedSystem(id: string, name: string) {
  return {
    id,
    workspace_id: 'workspace',
    slug: name.toLowerCase(),
    name,
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}
