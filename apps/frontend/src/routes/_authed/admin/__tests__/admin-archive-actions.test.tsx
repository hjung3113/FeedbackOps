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
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AnalyticsAreasAdminPage } from '../analytics-areas.js';
import { ManagedSystemsAdminPage } from '../managed-systems.js';

const ACTIVE_MS_SLUG = 'active';
const ARCHIVED_MS_SLUG = 'archived';
const ACTIVE_AREA_SLUG = 'active-area';
const ARCHIVED_AREA_SLUG = 'archived-area';

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function renderPage(path: string, component: () => React.ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function installFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/me/permissions/check'))
      return response({ state: 'approved', decision: { allow: true } });
    if (url.startsWith('/managed-systems'))
      return response({
        items: [
          {
            id: 'ms-active',
            slug: ACTIVE_MS_SLUG,
            name: 'Active',
            external_key: null,
            owner_actor_id: null,
            created_at: '2026-01-01T00:00:00.000Z',
            archived_at: null,
          },
          {
            id: 'ms-archived',
            slug: ARCHIVED_MS_SLUG,
            name: 'Archived',
            external_key: null,
            owner_actor_id: null,
            created_at: '2026-01-01T00:00:00.000Z',
            archived_at: '2026-02-01T00:00:00.000Z',
          },
        ],
      });
    return response({
      items: [
        {
          id: 'aa-active',
          managed_system_id: 'ms-active',
          slug: ACTIVE_AREA_SLUG,
          name: 'Active Area',
          owner_team_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
          archived_at: null,
        },
        {
          id: 'aa-archived',
          managed_system_id: 'ms-active',
          slug: ARCHIVED_AREA_SLUG,
          name: 'Archived Area',
          owner_team_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
          archived_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      total: 2,
    });
  });
}

describe('admin archive actions', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D9 active and archived Analytics Areas expose the correct Archive state', async () => {
    installFetch();
    renderPage('/admin/analytics-areas', AnalyticsAreasAdminPage);
    fireEvent.click(await screen.findByTestId(`aa-detail-${ACTIVE_AREA_SLUG}`));
    fireEvent.click(await screen.findByTestId('aa-edit-button'));
    expect(await screen.findByTestId(`aa-archive-${ACTIVE_AREA_SLUG}`)).toBeInTheDocument();
    // The dialog's own close control is a sr-only "Close" inside DialogContent
    // whose accessible name collides with other controls; Escape is the stable
    // way to dismiss a Radix dialog from a test.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // The include-archived toggle lives inside the filter popover.
    fireEvent.click(screen.getByTestId('aa-filter-button'));
    fireEvent.click(await screen.findByTestId('aa-filter-include-archived'));
    fireEvent.click(await screen.findByTestId(`aa-detail-${ARCHIVED_AREA_SLUG}`));
    fireEvent.click(await screen.findByTestId('aa-edit-button'));
    expect(screen.getByText('이미 보관됨')).toBeInTheDocument();
    expect(screen.queryByTestId(`aa-archive-${ARCHIVED_AREA_SLUG}`)).not.toBeInTheDocument();
  });

  test('AC-D9 active and archived Managed Systems expose the correct Archive state', async () => {
    installFetch();
    renderPage('/admin/managed-systems', ManagedSystemsAdminPage);
    await waitFor(() =>
      expect(screen.getByTestId(`managed-system-row-${ACTIVE_MS_SLUG}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`ms-configure-${ACTIVE_MS_SLUG}`));
    expect(await screen.findByTestId(`archive-${ACTIVE_MS_SLUG}`)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('ms-filter-button'));
    fireEvent.click(await screen.findByTestId('ms-filter-include-archived'));
    await waitFor(() =>
      expect(screen.getByTestId(`managed-system-row-${ARCHIVED_MS_SLUG}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`ms-configure-${ARCHIVED_MS_SLUG}`));
    expect(screen.getByText('이미 보관됨')).toBeInTheDocument();
    expect(screen.queryByTestId(`archive-${ARCHIVED_MS_SLUG}`)).not.toBeInTheDocument();
  });

  test('#324 an archived Managed System offers re-registration instead of a Save that must 409', async () => {
    installFetch();
    renderPage('/admin/managed-systems', ManagedSystemsAdminPage);
    await waitFor(() =>
      expect(screen.getByTestId(`managed-system-row-${ACTIVE_MS_SLUG}`)).toBeInTheDocument(),
    );

    // Active row first: it keeps Save. Without this the archived assertion below
    // would also pass against a build that simply never renders Save.
    fireEvent.click(screen.getByTestId(`ms-configure-${ACTIVE_MS_SLUG}`));
    expect(await screen.findByTestId(`save-${ACTIVE_MS_SLUG}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`reregister-${ACTIVE_MS_SLUG}`)).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByTestId('ms-filter-button'));
    fireEvent.click(await screen.findByTestId('ms-filter-include-archived'));
    await waitFor(() =>
      expect(screen.getByTestId(`managed-system-row-${ARCHIVED_MS_SLUG}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`ms-configure-${ARCHIVED_MS_SLUG}`));

    // PATCH against an archived row is 409 conflict.record_archived by contract,
    // so Save must be gone rather than merely disabled.
    expect(
      await screen.findByTestId(`archived-immutable-note-${ARCHIVED_MS_SLUG}`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(`save-${ARCHIVED_MS_SLUG}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`reregister-${ARCHIVED_MS_SLUG}`));

    const register = await screen.findByTestId('ms-register-dialog');
    expect(register).toBeInTheDocument();
    expect(screen.getByTestId('create-slug')).toHaveValue(ARCHIVED_MS_SLUG);
  });
});
