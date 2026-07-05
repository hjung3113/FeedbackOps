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
import { Database, Flag, Inbox, Layers, ListTodo, Plus, User } from 'lucide-react';
import { UnauthenticatedError, fetchMe } from '../lib/api';
import { AppFrame } from '../lib/layout/AppFrame';

// Sidebar entries locked per Slice 3 #18 spec (C5).
// Per-feature entries are added in their owning slice (AGENTS.md two-consumer rule).
// Icons mapped from docs/design-prototype/shell.jsx NAV_TREE.voc + NAV_TREE.admin per #95.
export const SIDEBAR_ENTRIES = [
  {
    id: 'inbox',
    label: 'Inbox',
    href: '/vocs?view=inbox',
    section: 'VOC',
    icon: <Inbox className="h-4 w-4" />,
  },
  {
    id: 'triage',
    label: 'Triage',
    href: '/vocs?view=triage',
    section: 'VOC',
    icon: <Flag className="h-4 w-4" />,
  },
  {
    id: 'my-vocs',
    label: 'My VOCs',
    href: '/vocs?view=my',
    section: 'VOC',
    icon: <User className="h-4 w-4" />,
  },
  {
    id: 'voc-clusters',
    label: 'Clusters',
    href: '/voc-clusters',
    section: 'VOC',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    id: 'create',
    label: 'New VOC',
    href: '/vocs?action=create',
    section: 'VOC',
    icon: <Plus className="h-4 w-4" />,
  },
  {
    id: 'task-requests',
    label: 'Task Requests',
    href: '/tasks?view=requests',
    section: 'TASKS',
    icon: <Inbox className="h-4 w-4" />,
  },
  {
    id: 'tasks-board',
    label: 'Tasks',
    href: '/tasks?view=board',
    section: 'TASKS',
    icon: <ListTodo className="h-4 w-4" />,
  },
  {
    id: 'my-tasks',
    label: 'My Tasks',
    href: '/tasks?view=my',
    section: 'TASKS',
    icon: <User className="h-4 w-4" />,
  },
  // Admin entries — existing routes remain reachable via sidebar.
  {
    id: 'admin-ms',
    label: 'Managed Systems',
    href: '/admin/managed-systems',
    section: 'MANAGED SYSTEMS',
    icon: <Database className="h-4 w-4" />,
  },
  {
    id: 'admin-aa',
    label: 'Analytics Areas',
    href: '/admin/analytics-areas',
    section: 'MANAGED SYSTEMS',
    icon: <Layers className="h-4 w-4" />,
  },
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
