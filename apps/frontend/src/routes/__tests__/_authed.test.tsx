// Focused auth-branch examples from Slice 3 #18 cycle-2 P3-B.
// The route's query-cache and navigation behavior is covered by
// _authed-me-cache.test.tsx; this file keeps the original branch cases without
// mounting routeTree.gen.ts.

import { redirect } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthenticatedError, fetchMe } from '../../lib/api';
import { AppSidebar } from '../../lib/layout/AppSidebar';
import { NAV_TREE, SIDEBAR_ENTRIES, getSidebarEntryStates, isSidebarEntryActive } from '../_authed';

// Re-implement only the redirect/error branch expectations in isolation.
async function beforeLoad({ location }: { location: { href: string } }) {
  try {
    await fetchMe();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      throw redirect({ to: '/login', search: { redirectTo: location.href } });
    }
    throw err;
  }
}

describe('_authed beforeLoad', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('re-throws non-auth errors (network failure) without swallowing them', async () => {
    // Simulate a network error (not a 401 — e.g. DNS failure, 500, etc.)
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network failure');
    }) as typeof globalThis.fetch;

    await expect(beforeLoad({ location: { href: '/vocs?view=inbox' } })).rejects.toThrow(
      'Network failure',
    );
  });

  it('throws a redirect to /login on UnauthenticatedError', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'auth.session_invalid' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;

    let thrown: unknown;
    try {
      await beforeLoad({ location: { href: '/vocs?view=inbox' } });
    } catch (err) {
      thrown = err;
    }
    // TanStack redirect throws a special object with a redirectTo field
    expect(thrown).toBeDefined();
    // The redirect object is not an Error — it's a TanStack redirect signal
    expect(thrown instanceof Error).toBe(false);
  });

  it('resolves without throwing when fetchMe succeeds', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            actor: {
              id: '00000000-0000-0000-0000-000000000001',
              external_id: 'mock-admin-1',
              email: 'admin@feedbackops.local',
              display_name: 'Mock Admin',
              role_level: 'admin',
            },
            workspace_id: '11111111-1111-1111-1111-111111111111',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;

    await expect(beforeLoad({ location: { href: '/vocs?view=inbox' } })).resolves.toBeUndefined();
  });
});

describe('_authed sidebar navigation tree', () => {
  it('keeps every shipped destination reachable from exactly one rail tree', () => {
    const entries = SIDEBAR_ENTRIES.map(({ id, label, href, section }) => ({
      id,
      label,
      href,
      section,
    }));

    expect(entries).toEqual(
      expect.arrayContaining([
        { id: 'voc-clusters', label: 'Clusters', href: '/voc-clusters', section: 'VOC' },
        {
          id: 'task-requests',
          label: 'Task Requests',
          href: '/tasks?view=requests',
          section: 'TASKS',
        },
        { id: 'tasks-board', label: 'Tasks', href: '/tasks?view=board', section: 'TASKS' },
        { id: 'my-tasks', label: 'My Tasks', href: '/tasks?view=my', section: 'TASKS' },
      ]),
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        { id: 'findings', label: 'All findings', href: '/findings', section: 'FINDINGS' },
      ]),
    );
  });

  it('#532 puts the Action dashboard first in Integration navigation', () => {
    expect(NAV_TREE.integration[0]).toMatchObject({
      id: 'integration-dashboard',
      label: 'Action dashboard',
      href: '/integration',
      section: 'INTEGRATION',
    });
  });

  it('#532 activates Action dashboard only on the exact /integration route', () => {
    const dashboardEntry = NAV_TREE.integration.find(
      (entry) => entry.id === 'integration-dashboard',
    );
    if (dashboardEntry === undefined) throw new Error('missing integration-dashboard nav entry');
    expect(isSidebarEntryActive(dashboardEntry, '/integration', '')).toBe(true);
    expect(isSidebarEntryActive(dashboardEntry, '/integration/links', '')).toBe(false);
  });

  it('keeps other parent navigation entries active on their detail routes', () => {
    const findingsEntry = NAV_TREE.findings[0];
    if (findingsEntry === undefined) throw new Error('missing findings nav entry');
    expect(isSidebarEntryActive(findingsEntry, '/findings/finding-a', '')).toBe(true);
  });
});

describe('_authed sidebar current destination', () => {
  it.each([
    { route: 'Default Inbox', pathname: '/vocs', searchStr: '', expectedId: 'inbox' },
    {
      route: 'Default Inbox with selected VOC',
      pathname: '/vocs',
      searchStr: '?selected=11111111-1111-4111-8111-111111111111',
      expectedId: 'inbox',
    },
    { route: 'Inbox', pathname: '/vocs', searchStr: '?view=inbox', expectedId: 'inbox' },
    { route: 'Triage', pathname: '/vocs', searchStr: '?view=triage', expectedId: 'triage' },
    {
      route: 'High severity triage',
      pathname: '/vocs',
      searchStr: '?view=triage&tab=high',
      expectedId: 'high-severity',
    },
    {
      route: 'Unassigned triage',
      pathname: '/vocs',
      searchStr: '?view=triage&tab=unassigned',
      expectedId: 'unassigned',
    },
    {
      route: 'No follow-up triage',
      pathname: '/vocs',
      searchStr: '?view=triage&tab=no-link',
      expectedId: 'no-link',
    },
    { route: 'My VOCs', pathname: '/vocs', searchStr: '?view=my', expectedId: 'my-vocs' },
    {
      route: 'Clusters',
      pathname: '/voc-clusters',
      searchStr: '',
      expectedId: 'voc-clusters',
    },
    {
      route: 'New VOC action',
      pathname: '/vocs',
      searchStr: '?action=create',
      expectedId: 'inbox',
    },
    {
      route: 'Default Task list',
      pathname: '/tasks',
      searchStr: '',
      expectedId: 'my-tasks',
    },
  ])('marks only $expectedId current for $route', ({ pathname, searchStr, expectedId }) => {
    localStorage.removeItem('appSidebarCollapsed');
    const entries = pathname === '/tasks' ? NAV_TREE.tasks : NAV_TREE.voc;
    render(<AppSidebar entries={getSidebarEntryStates(entries, pathname, searchStr)} />);

    const navLinks = entries.map((entry) => screen.getByTestId(`sidebar-nav-${entry.id}`));
    const currentLinks = navLinks.filter((entry) => entry.getAttribute('aria-current') === 'page');
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(screen.getByTestId(`sidebar-nav-${expectedId}`));
    expect(currentLinks[0]).toHaveClass('bg-surface-row-selected');

    for (const entry of navLinks) {
      expect(entry.classList.contains('bg-surface-row-selected')).toBe(
        entry.getAttribute('aria-current') === 'page',
      );
    }

    const createEntry = screen.queryByTestId('sidebar-nav-create');
    if (createEntry !== null) {
      expect(createEntry).not.toHaveAttribute('aria-current', 'page');
      expect(createEntry).not.toHaveClass('bg-surface-row-selected');
    }

    if (['high-severity', 'unassigned', 'no-link'].includes(expectedId)) {
      const triageEntry = screen.getByTestId('sidebar-nav-triage');
      expect(triageEntry).not.toHaveAttribute('aria-current', 'page');
      expect(triageEntry).not.toHaveClass('bg-surface-row-selected');
      expect(triageEntry).toHaveClass('text-text-primary');
    } else if (expectedId !== 'triage' && entries.some((entry) => entry.id === 'triage')) {
      expect(screen.getByTestId('sidebar-nav-triage')).not.toHaveClass('font-medium');
    }
  });
});
