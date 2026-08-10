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
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AnalyticsAreasAdminPage } from '../analytics-areas.js';
import { ManagedSystemsAdminPage } from '../managed-systems.js';

type PostedRequest = { pathname: string; body: unknown };

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch() {
  const postedRequests: PostedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'POST') {
      postedRequests.push({
        pathname: url.pathname,
        body: init.body ? JSON.parse(String(init.body)) : {},
      });
      return response({});
    }
    if (url.pathname === '/me/permissions/check') {
      return response({ state: 'approved', decision: { allow: true } });
    }
    if (url.pathname === '/managed-systems') {
      return response({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: 'powerbi',
            name: 'Power BI',
            external_key: null,
            owner_actor_id: null,
            archived_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
    }
    if (url.pathname === '/analytics-areas') return response({ items: [], total: 0 });
    if (url.pathname === '/permissions/requests') return response({ requests: [], count: 0 });
    return response({ actors: [], teams: [] });
  });
  return postedRequests;
}

function renderRoute(path: string, component: () => React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({ getParentRoute: () => rootRoute, path, component });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
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

describe('Admin required registration fields', () => {
  afterEach(() => vi.restoreAllMocks());

  test('AC-D7a empty Managed System registration renders inline errors and submits exactly 0 requests', async () => {
    const postedRequests = installFetch();
    renderRoute('/admin/managed-systems', ManagedSystemsAdminPage);
    fireEvent.click(await screen.findByTestId('ms-register-button'));
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText('· 필수', { exact: true })).toHaveLength(2);
    expect(screen.getByText('Slug is required.')).toBeInTheDocument();
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(postedRequests).toEqual([]);
  });

  test('AC-D7b empty Managed System registration focuses the first invalid field', async () => {
    installFetch();
    renderRoute('/admin/managed-systems', ManagedSystemsAdminPage);
    fireEvent.click(await screen.findByTestId('ms-register-button'));
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));
    await waitFor(() => expect(screen.getByTestId('create-slug')).toHaveFocus());
  });

  test('AC-D7c empty Analytics Area registration renders inline errors, focuses Managed System, and submits exactly 0 requests', async () => {
    const postedRequests = installFetch();
    renderRoute('/admin/analytics-areas', AnalyticsAreasAdminPage);
    fireEvent.click(await screen.findByTestId('aa-new-area-button'));
    fireEvent.submit(screen.getByTestId('create-analytics-area-form'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText('· 필수', { exact: true })).toHaveLength(3);
    expect(screen.getByText('Managed System is required.')).toBeInTheDocument();
    expect(screen.getByText('Slug is required.')).toBeInTheDocument();
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    // ManagedSystemPicker is a Radix ToggleGroup type="single", so its options
    // are radios inside a radiogroup — not buttons.
    expect(screen.getByRole('radio', { name: 'Power BI' })).toHaveFocus();
    expect(postedRequests).toEqual([]);
  });
});
