import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ManagedSystemsAdminPage } from '../managed-systems.js';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_NAME = 'Owner Fixture Name';
const ACTOR_EMAIL = 'email-must-never-render@example.test';
const TEAM_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_OWNER_SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_OWNER_SYSTEM_ID = '44444444-4444-4444-8444-444444444444';

type CapturedRequest = { method: string; pathname: string; body: Record<string, unknown> };

const systems = [
  {
    id: UNKNOWN_OWNER_SYSTEM_ID,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    slug: 'owner-unknown',
    name: 'Owner Unknown System',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: TEAM_OWNER_SYSTEM_ID,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    slug: 'team-owned',
    name: 'Team Owned System',
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: TEAM_ID,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch() {
  const captured: CapturedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (method === 'POST' || method === 'PATCH') {
      captured.push({
        method,
        pathname: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      return response({});
    }
    if (url.pathname === '/me/permissions/check') {
      return response({ state: 'approved', decision: { allow: true } });
    }
    if (url.pathname === '/managed-systems') return response({ items: systems, total: 2 });
    if (url.pathname === '/analytics-areas') return response({ items: [], total: 0 });
    if (url.pathname === '/permissions/requests') return response({ requests: [], count: 0 });
    if (url.pathname === '/actors') {
      return response({
        actors: [
          {
            id: ACTOR_ID,
            display_name: ACTOR_NAME,
            email: ACTOR_EMAIL,
            role_level: 'developer',
          },
        ],
      });
    }
    if (url.pathname === '/actors/resolve') {
      return response({ actors: [], teams: [{ id: TEAM_ID, name: 'Platform Team Fixture' }] });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });
  return captured;
}

function renderPage() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/admin/managed-systems',
    component: ManagedSystemsAdminPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/admin/managed-systems'] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openRegister() {
  fireEvent.click(await screen.findByTestId('ms-register-button'));
  expect(screen.getByTestId('ms-register-dialog')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'owner-fixture' } });
  fireEvent.change(screen.getByTestId('create-name'), {
    target: { value: 'Owner Fixture System' },
  });
}

async function chooseActor(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole('option', { name: ACTOR_NAME }));
}

describe('Managed System default owner', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D9a registration sends exactly one body with the selected actor owner', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    await chooseActor('create-default-owner');

    fireEvent.submit(screen.getByTestId('create-managed-system-form'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toEqual({
      method: 'POST',
      pathname: '/managed-systems',
      body: {
        slug: 'owner-fixture',
        name: 'Owner Fixture System',
        default_owner_actor_id: ACTOR_ID,
      },
    });
  });

  test('AC-D9b unassigned registration renders owner and omits both keys', async () => {
    const captured = installFetch();
    renderPage();
    await openRegister();
    expect(screen.getByTestId('create-default-owner')).toHaveTextContent('(미지정)');

    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await waitFor(() => expect(captured).toHaveLength(1));

    expect(captured[0]?.body.slug).toBe('owner-fixture');
    expect(captured[0]?.body).not.toHaveProperty('default_owner_actor_id');
    expect(captured[0]?.body).not.toHaveProperty('default_owner_team_id');
  });

  test('AC-D9c owner-unknown edit sends one PATCH with the selected actor', async () => {
    const captured = installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-owner-unknown'));
    expect(screen.getByTestId('ms-edit-dialog')).toBeInTheDocument();
    await chooseActor('edit-default-owner-owner-unknown');

    fireEvent.submit(screen.getByTestId('edit-managed-system-form-owner-unknown'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toEqual({
      method: 'PATCH',
      pathname: `/managed-systems/${UNKNOWN_OWNER_SYSTEM_ID}`,
      body: { default_owner_actor_id: ACTOR_ID, default_owner_team_id: null },
    });
  });

  test('AC-D9d choosing an actor replaces the team in the single owner selection', async () => {
    const captured = installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-team-owned'));
    const selector = screen.getByTestId('edit-default-owner-team-owned');
    await waitFor(() => expect(selector).toHaveTextContent('Platform Team Fixture'));
    await chooseActor('edit-default-owner-team-owned');
    expect(selector).toHaveTextContent(ACTOR_NAME);

    fireEvent.submit(screen.getByTestId('edit-managed-system-form-team-owned'));

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]?.body).toEqual({
      default_owner_actor_id: ACTOR_ID,
      default_owner_team_id: null,
    });
    expect(
      captured.some(
        ({ body }) =>
          typeof body.default_owner_actor_id === 'string' &&
          typeof body.default_owner_team_id === 'string',
      ),
    ).toBe(false);
  });

  test('AC-D9e owner options render actor name and never the distinct email', async () => {
    installFetch();
    renderPage();
    await openRegister();
    fireEvent.click(screen.getByTestId('create-default-owner'));

    const listbox = await screen.findByRole('listbox');
    // The actor list arrives from an async query; the listbox mounts first with
    // only the static "(미지정)" entry. Sync getByRole here raced that fetch.
    expect(await within(listbox).findByRole('option', { name: ACTOR_NAME })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body).not.toHaveTextContent(ACTOR_EMAIL);
  });
});
