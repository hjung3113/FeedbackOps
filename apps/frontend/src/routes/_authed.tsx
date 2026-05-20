// _authed — pathless layout route. All authenticated routes live under this
// file. URL paths are unchanged (/_authed is pathless in TanStack convention).
//
// Auth guard: beforeLoad runs fetchMe. If the session probe throws
// UnauthenticatedError, the visitor is redirected to /login. Any other error
// re-throws so TanStack Router surfaces it via the error boundary.
//
// AppFrame is mounted here, wrapping the downstream <Outlet>.
// Shell taxonomy (PageShell / ListShell / WorkbenchShell) is applied per-route
// INSIDE AppFrame — not here. ADR-0020 §taxonomy lock.

import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { AppFrame } from '../lib/layout/AppFrame';
import { UnauthenticatedError, fetchMe } from '../lib/api.js';

// Sidebar entries locked per Slice 3 #18 spec (C5).
// Per-feature entries are added in their owning slice (AGENTS.md two-consumer rule).
const SIDEBAR_ENTRIES = [
  { id: 'inbox',    label: 'Inbox',            href: '/vocs?view=inbox' },
  { id: 'my-vocs',  label: 'My VOCs',          href: '/vocs?view=my' },
  { id: 'triage',   label: 'Triage',           href: '/vocs?view=triage' },
  { id: 'create',   label: '+ New VOC',        href: '/vocs?action=create' },
  // Admin entries — existing routes remain reachable via sidebar.
  { id: 'admin-ms', label: 'Managed Systems',  href: '/admin/managed-systems' },
  { id: 'admin-aa', label: 'Analytics Areas',  href: '/admin/analytics-areas' },
];

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    // Extracted verbatim from the per-route pattern used by all admin/* routes
    // (managed-systems.tsx, analytics-areas.tsx, placeholder.tsx, index.tsx).
    try {
      await fetchMe();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        throw redirect({ to: '/login', search: { redirectTo: location.href } });
      }
      // Non-auth errors re-throw so TanStack Router's error boundary catches them.
      throw err;
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppFrame sidebarEntries={SIDEBAR_ENTRIES}>
      <Outlet />
    </AppFrame>
  );
}
