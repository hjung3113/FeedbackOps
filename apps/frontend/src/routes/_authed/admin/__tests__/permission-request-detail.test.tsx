import { DetailPanelSlotContext } from '@fops/ui';
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
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PermissionRequestsConsolePage } from '../permissions/requests.js';

const requester = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_name: 'Visible Requester',
  email: 'visible.requester@example.test',
  role_level: 'developer',
};

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function DetailPanelHost({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<ReactNode>();
  const setContent = useCallback((_key: string, node: ReactNode) => setPanel(node), []);
  const clear = useCallback(() => setPanel(undefined), []);
  const context = useMemo(() => ({ setContent, clear }), [setContent, clear]);

  return (
    <DetailPanelSlotContext.Provider value={context}>
      {children}
      {panel}
    </DetailPanelSlotContext.Provider>
  );
}

function renderPage() {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/admin/permissions/requests',
    component: PermissionRequestsConsolePage,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/admin/permissions/requests'] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DetailPanelHost>
        <RouterProvider router={router} />
      </DetailPanelHost>
    </QueryClientProvider>,
  );
}

function installFetch(actors = [requester]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/me/permissions/check'))
      return response({ state: 'approved', decision: { allow: true } });
    if (url === '/me')
      return response({
        actor: {
          id: 'admin',
          external_id: 'admin',
          email: 'admin@example.test',
          display_name: 'Admin',
          role_level: 'admin',
        },
        workspace_id: 'workspace',
      });
    if (url === '/workspace/settings')
      return response({ permission_self_approval: 'allowed', survey_anonymity_threshold: 5 });
    if (url.startsWith('/actors')) return response({ actors });
    return response({
      requests: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          requester_actor_id: requester.id,
          requested_capability: 'workspace.read',
          requested_managed_system_id: null,
          reason: 'Need access',
          status: 'pending',
          created_at: '2026-08-02T00:00:00.000Z',
        },
      ],
      count: 1,
    });
  });
}

describe('Permission Requests public page', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D8a renders Permission Request header and never renders TASK', async () => {
    installFetch();
    renderPage();
    const panel = await screen.findByTestId('permission-request-detail-panel');
    expect(panel).toHaveTextContent('Permission Request');
    expect(screen.queryByText('Task', { exact: true })).not.toBeInTheDocument();
  });

  test('AC-D8b renders requester name but never its fixture email', async () => {
    installFetch();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(requester.display_name, { exact: true })).toBeInTheDocument(),
    );
    expect(screen.queryByText(requester.email, { exact: true })).not.toBeInTheDocument();
  });

  test('AC-D8c renders Unknown requester when no matching actor is returned', async () => {
    installFetch([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Unknown requester', { exact: true })).toBeInTheDocument(),
    );
  });
});
