import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AnalyticsAreasAdminPage } from '../analytics-areas.js';
import { ManagedSystemsAdminPage } from '../managed-systems.js';

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

// One active system with one active area; archiving either removes it from the next list read.
function installFetch(gate?: { list: Promise<void> | null }) {
  const archived = { ms: false, aa: false };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/me/permissions/check'))
      return response({ state: 'approved', decision: { allow: true } });
    if (init?.method === 'POST' && url === '/managed-systems/ms-active/archive') {
      archived.ms = true;
      return response({});
    }
    if (init?.method === 'POST' && url === '/analytics-areas/aa-active/archive') {
      archived.aa = true;
      return response({});
    }
    // Hold the list read that follows an archive until the test releases it.
    if (gate?.list && (archived.ms || archived.aa)) await gate.list;
    if (url.startsWith('/managed-systems'))
      return response({
        items: [
          {
            id: 'ms-active',
            slug: 'active',
            name: 'Active',
            external_key: null,
            owner_actor_id: null,
            created_at: '2026-01-01T00:00:00.000Z',
            archived_at: null,
          },
        ].filter(() => !archived.ms),
      });
    return response({
      items: [
        {
          id: 'aa-active',
          managed_system_id: 'ms-active',
          slug: 'active-area',
          name: 'Active Area',
          owner_team_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
          archived_at: null,
        },
      ].filter(() => !archived.aa),
      total: 1,
    });
  });
}

const msOpen = async () => {
  const trigger = await screen.findByRole('button', { name: 'Active 설정' });
  fireEvent.click(trigger);
  await screen.findByTestId('ms-edit-dialog');
  return trigger;
};

const aaOpen = async () => {
  const trigger = await screen.findByTestId('aa-detail-active-area');
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('button', { name: 'Active Area 편집' }));
  await screen.findByTestId('aa-edit-dialog');
  return trigger;
};

const surfaces = [
  {
    label: 'Managed System',
    path: '/admin/managed-systems',
    page: ManagedSystemsAdminPage,
    open: msOpen,
    dialog: 'ms-edit-dialog',
    archive: 'archive-active',
    heading: '레지스트리',
  },
  {
    label: 'Analytics Area',
    path: '/admin/analytics-areas',
    page: AnalyticsAreasAdminPage,
    open: aaOpen,
    dialog: 'aa-edit-dialog',
    archive: 'aa-archive-active-area',
    heading: '카탈로그',
  },
] as const;

describe('admin settings dialogs', () => {
  afterEach(() => vi.restoreAllMocks());

  test('row buttons carry the record name in their accessible name', async () => {
    installFetch();
    renderPage('/admin/managed-systems', ManagedSystemsAdminPage);
    expect(await screen.findAllByRole('button', { name: 'Active 설정' })).toHaveLength(1);
  });

  test.each(surfaces)('$label dialog returns focus to the row trigger on Escape', async (s) => {
    installFetch();
    renderPage(s.path, s.page);
    const trigger = await s.open();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId(s.dialog)).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test.each(surfaces)('$label archive moves focus to the list heading', async (s) => {
    installFetch();
    renderPage(s.path, s.page);
    await s.open();
    fireEvent.click(await screen.findByTestId(s.archive));
    const confirm = await screen.findByTestId(`${s.archive}-confirm-dialog`);
    fireEvent.click(within(confirm).getByRole('button', { name: '보관' }));
    await waitFor(() => expect(screen.queryByTestId(s.dialog)).toBeNull());
    await waitFor(() => expect(screen.getByRole('heading', { name: s.heading })).toHaveFocus());
  });

  test.each(surfaces)(
    '$label archive falls back to the heading only after the slow list drops the row',
    async (s) => {
      let release: () => void = () => {};
      installFetch({
        list: new Promise<void>((resolve) => {
          release = resolve;
        }),
      });
      renderPage(s.path, s.page);
      const trigger = await s.open();
      fireEvent.click(await screen.findByTestId(s.archive));
      const confirm = await screen.findByTestId(`${s.archive}-confirm-dialog`);
      fireEvent.click(within(confirm).getByRole('button', { name: '보관' }));
      await waitFor(() => expect(screen.queryByTestId(s.dialog)).toBeNull());
      // The dialog is closed while the old row is still rendered: focus returns to it.
      await waitFor(() => expect(trigger).toHaveFocus());
      release();
      await waitFor(() => expect(trigger).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByRole('heading', { name: s.heading })).toHaveFocus());
    },
  );

  test('Managed System settings ask before discarding unsaved edits; clean ones close at once', async () => {
    installFetch();
    renderPage('/admin/managed-systems', ManagedSystemsAdminPage);
    await msOpen();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('ms-edit-dialog')).toBeNull());

    await msOpen();
    fireEvent.change(screen.getByTestId('name-input-active'), { target: { value: 'Renamed' } });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByTestId('ms-edit-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).toBeNull());
    expect(screen.getByTestId('name-input-active')).toHaveValue('Renamed');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: '이동' }));
    await waitFor(() => expect(screen.queryByTestId('ms-edit-dialog')).toBeNull());
  });
});
