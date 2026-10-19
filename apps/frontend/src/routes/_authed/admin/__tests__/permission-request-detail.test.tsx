import { adminDetailFixture } from '@/test/permission-details';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { AdminPermissionRequestRow } from '@/lib/api';
import { PermissionRequestsConsolePage } from '../permissions/requests.js';

const requester = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_name: 'Visible Requester',
  email: 'visible.requester@example.test',
  role_level: 'developer',
};

const requestRow: AdminPermissionRequestRow = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 7,
  requester_actor_id: requester.id,
  requested_capability: 'workspace.read',
  requested_managed_system_id: null,
  requested_expiration: null,
  reason: 'Need access',
  status: 'pending',
  created_at: '2026-08-02T00:00:00.000Z',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function DetailPanelSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}
function DetailPanelHost({ children }: { children: ReactNode }) {
  return (
    <DetailPanelSlotProvider>
      {children}
      <DetailPanelSlotHost />
    </DetailPanelSlotProvider>
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

// The selected GET must satisfy the strict permissionRequestAdminDetailSchema;
// a collection-only payload fails the parser and the panel never loads.
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
    if (url === '/permissions/requests?status=all')
      return response({ requests: [requestRow], count: 1 });
    if (/^\/permissions\/requests\/[0-9a-f-]+$/.test(url))
      return response(adminDetailFixture(requestRow));
    return response({ code: 'internal.unexpected', message: 'unmocked' }, 500);
  });
}

describe('Permission Requests public page', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D8a renders Permission Request header and never renders TASK', async () => {
    installFetch();
    renderPage();
    // The loading aside shares the panel test ID; wait for the loaded detail.
    await screen.findByText('Need access');
    const panel = screen.getByTestId('permission-request-detail-panel');
    expect(panel).toHaveTextContent('권한 요청');
    expect(screen.queryByText('Task', { exact: true })).not.toBeInTheDocument();
  });

  test('AC-D8b renders requester name but never its fixture email', async () => {
    installFetch();
    renderPage();
    await screen.findByText(requester.display_name, { exact: true });
    expect(screen.queryByText(requester.email, { exact: true })).not.toBeInTheDocument();
  });

  test('AC-D8c renders the unknown-requester fallback when no matching actor is returned', async () => {
    installFetch([]);
    renderPage();
    // #589: Korean-first fallback copy; not prototype copy.
    await screen.findByText('알 수 없는 사용자', { exact: true });
  });
});
