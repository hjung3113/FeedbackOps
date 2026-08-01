import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardSummarySchema } from '@fops/shared';

import { AppSidebar } from '@/lib/layout/AppSidebar';
import { HomeScreen } from '../HomeScreen';
import { homeSidebarEntries } from '../homeNavigation';
import { HomeRoute } from '@/routes/_authed/home';

const response = {
  kpis: { open_voc: 1 },
  action_queues: [
    { id: 'unassigned-voc', severity: 'urgent', count: 0, next_action: { label: 'Review', route: '/vocs?view=triage', intent: 'review' }, secondary_action: null },
    { id: 'actionable-finding-no-execution', severity: 'warn', count: 2, next_action: { label: 'Request', route: '/findings', intent: 'request' }, secondary_action: null },
    { id: 'permission-requests-pending', severity: 'info', count: 1, next_action: { label: 'Open', route: '/admin/permissions/requests', intent: 'review' }, secondary_action: null },
  ],
  coverage: [],
};

function installFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/me')) return new Response(JSON.stringify({ actor: { id: '11111111-1111-4111-8111-111111111111', external_id: 'actor', email: 'actor@example.test', display_name: '지원', role_level: 'admin' }, workspace_id: '22222222-2222-4222-8222-222222222222' }), { status: 200 });
    if (url.startsWith('/dashboard/summary')) return new Response(JSON.stringify(response), { status: 200 });
    if (url.startsWith('/tasks') || url.startsWith('/task-requests')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (url.startsWith('/permission-requests/mine')) return new Response(JSON.stringify({ requests: [] }), { status: 200 });
    return new Response('not mocked', { status: 500 });
  });
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  return fetchMock;
}

function buildHarness(initialPath: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({ getParentRoute: () => root, path: '/home', component: HomeRoute });
  return createRouter({ routeTree: root.addChildren([home]), history: createMemoryHistory({ initialEntries: [initialPath] }) });
}

function renderHome(initialPath = '/home') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = buildHarness(initialPath);
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

function ScopeHarness(): React.ReactElement {
  const [managedSystemId, setManagedSystemId] = React.useState<string | undefined>();
  return <>
    <AppSidebar
      entries={homeSidebarEntries(undefined, true)}
      managedSystems={[{ id: '33333333-3333-4333-8333-333333333333', name: 'Finance', granted: true }]}
      onManagedSystemChange={setManagedSystemId}
    />
    <HomeScreen {...(managedSystemId !== undefined ? { managedSystemId } : {})} />
  </>;
}

describe('HomeScreen route content', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it('renders a present zero queue and omits absent queue cards', async () => {
    installFetch();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('home-queue-unassigned-voc')).toBeInTheDocument());
    expect(screen.getByTestId('home-queue-count-unassigned-voc')).toHaveTextContent('0');
    expect(screen.getByText('오늘 워크스페이스에 3개의 운영 갭이 있습니다. 우선순위가 높은 큐부터 확인하세요.')).toBeInTheDocument();
    expect(screen.queryByTestId('home-queue-high-severity-unlinked')).toBeNull();
  });

  it('renders a present zero queue in the sidebar', () => {
    render(<AppSidebar entries={homeSidebarEntries(dashboardSummarySchema.parse(response), true)} />);
    expect(screen.getByTestId('sidebar-count-queue-unassigned-voc')).toHaveTextContent('0');
    expect(screen.getByText('Configured follow-up')).toBeInTheDocument();
  });

  it('omits permission-hidden queue ids from the sidebar', () => {
    const absent = dashboardSummarySchema.parse({ ...response, action_queues: response.action_queues.filter((queue) => queue.id !== 'permission-requests-pending') });
    render(<AppSidebar entries={homeSidebarEntries(absent, true)} />);
    expect(screen.queryByTestId('sidebar-nav-queue-permission-requests-pending')).toBeNull();
    expect(screen.queryByTestId('sidebar-count-queue-permission-requests-pending')).toBeNull();
  });

  it('maps urgent, warn, and info queues to their semantic color classes', async () => {
    installFetch();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('home-queue-unassigned-voc')).toBeInTheDocument());
    expect(screen.getByTestId('home-queue-count-unassigned-voc')).toHaveClass('text-accent-danger');
    expect(screen.getByTestId('home-queue-count-actionable-finding-no-execution')).toHaveClass('text-accent-warn');
    expect(screen.getByTestId('home-queue-count-permission-requests-pending')).toHaveClass('text-accent-info');
  });

  it('refetches the strict summary when the scope selector changes', async () => {
    const fetchMock = installFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ScopeHarness /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('scope-selector'));
    fireEvent.click(screen.getByTestId('scope-option-33333333-3333-4333-8333-333333333333'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/dashboard/summary?managed_system_id=33333333-3333-4333-8333-333333333333', expect.anything()));
  });

  it('renders each open permission request capability', async () => {
    installFetch().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/me')) return new Response(JSON.stringify({ actor: { id: '11111111-1111-4111-8111-111111111111', external_id: 'actor', email: 'actor@example.test', display_name: '지원', role_level: 'admin' }, workspace_id: '22222222-2222-4222-8222-222222222222' }), { status: 200 });
      if (url.startsWith('/dashboard/summary')) return new Response(JSON.stringify(response), { status: 200 });
      if (url.startsWith('/tasks') || url.startsWith('/task-requests')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
      if (url.startsWith('/permission-requests/mine')) return new Response(JSON.stringify({ requests: [
        { id: 'request-1', requested_capability: 'workspace.admin', requested_managed_system_id: null, reason: 'Need admin', requested_object_type: null, requested_object_id: null, source_object_type: null, source_object_id: null, source_action_id: null, status: 'pending', created_at: '2026-08-01T00:00:00.000Z' },
        { id: 'request-2', requested_capability: 'finding.manage', requested_managed_system_id: null, reason: 'Need write', requested_object_type: null, requested_object_id: null, source_object_type: null, source_object_id: null, source_action_id: null, status: 'needs_more_info', created_at: '2026-08-01T00:00:00.000Z' },
      ] }), { status: 200 });
      return new Response('not mocked', { status: 500 });
    });
    renderHome();
    await screen.findByTestId('home-open-requests-list');
    expect(screen.getByText('workspace.admin')).toBeInTheDocument();
    expect(screen.getByText('finding.manage')).toBeInTheDocument();
  });

  it('renders the empty state without the request list after the query resolves', async () => {
    installFetch();
    renderHome();
    await screen.findByText('No open requests.');
    expect(screen.queryByTestId('home-open-requests-list')).not.toBeInTheDocument();
  });
});
