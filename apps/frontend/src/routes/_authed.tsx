import { Outlet, createFileRoute, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { Database, FileBarChart, Flag, Inbox, Layers, Link2, ListChecks, ListTodo, Plus, Settings, Shield, User } from 'lucide-react';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UnauthenticatedError, fetchDashboardSummary, fetchMe } from '../lib/api';
import { homeSidebarEntries } from '../features/home/homeNavigation';
import { AppFrame } from '../lib/layout/AppFrame';
import { railForPathname, type RailDomain } from '../lib/layout/AppRail';
import type { SidebarNavEntry } from '../lib/layout/AppSidebar';
import type { SavedView } from '../lib/api';

export const NAV_TREE: Record<Exclude<RailDomain, 'home'>, SidebarNavEntry[]> = {
  voc: [
    { id: 'inbox', label: 'Inbox', href: '/vocs?view=inbox', section: 'VOC', icon: <Inbox className="h-4 w-4" />, countKey: 'voc.inbox' },
    { id: 'triage', label: 'Triage', href: '/vocs?view=triage', section: 'VOC', icon: <Flag className="h-4 w-4" />, countKey: 'voc.triage' },
    { id: 'my-vocs', label: 'My VOCs', href: '/vocs?view=my', section: 'VOC', icon: <User className="h-4 w-4" />, countKey: 'voc.my' },
    { id: 'voc-clusters', label: 'Clusters', href: '/voc-clusters', section: 'VOC', icon: <Layers className="h-4 w-4" />, countKey: 'voc.clusters' },
    { id: 'create', label: 'New VOC', href: '/vocs?action=create', section: 'VOC', icon: <Plus className="h-4 w-4" /> },
    { id: 'high-severity', label: 'High severity', href: '/vocs?view=triage&tab=high', section: 'VIEWS', icon: <Flag className="h-4 w-4" />, countKey: 'voc.tab.high' },
    { id: 'unassigned', label: 'Unassigned', href: '/vocs?view=triage&tab=unassigned', section: 'VIEWS', icon: <User className="h-4 w-4" />, countKey: 'voc.tab.unassigned', urgent: true },
    { id: 'no-link', label: 'No follow-up', href: '/vocs?view=triage&tab=no-link', section: 'VIEWS', icon: <Link2 className="h-4 w-4" />, countKey: 'voc.tab.no-link' },
  ],
  findings: [
    { id: 'findings', label: 'All findings', href: '/findings', section: 'FINDINGS', icon: <ListChecks className="h-4 w-4" />, countKey: 'findings.all' },
  ],
  tasks: [
    { id: 'task-requests', label: 'Task Requests', href: '/tasks?view=requests', section: 'TASKS', icon: <Inbox className="h-4 w-4" /> },
    { id: 'tasks-board', label: 'Tasks', href: '/tasks?view=board', section: 'TASKS', icon: <ListTodo className="h-4 w-4" /> },
    { id: 'my-tasks', label: 'My Tasks', href: '/tasks?view=my', section: 'TASKS', icon: <User className="h-4 w-4" /> },
  ],
  integration: [
    { id: 'integration-dashboard', label: 'Action dashboard', href: '/integration', section: 'INTEGRATION', icon: <FileBarChart className="h-4 w-4" /> },
    { id: 'integration-findings', label: 'Findings', href: '/findings', section: 'INTEGRATION', icon: <ListChecks className="h-4 w-4" />, countKey: 'findings.all' },
    { id: 'integration-links', label: 'Entity links', href: '/integration/links', section: 'INTEGRATION', icon: <Link2 className="h-4 w-4" /> },
  ],
  surveys: [
    { id: 'surveys', label: 'All surveys', href: '/surveys', section: 'SURVEYS', icon: <FileBarChart className="h-4 w-4" />, countKey: 'surveys.all' },
  ],
  admin: [
    { id: 'admin-ms', label: 'Managed Systems', href: '/admin/managed-systems', section: 'ADMIN', icon: <Database className="h-4 w-4" /> },
    { id: 'admin-aa', label: 'Analytics Areas', href: '/admin/analytics-areas', section: 'ADMIN', icon: <Layers className="h-4 w-4" /> },
    { id: 'admin-permissions', label: 'Permission requests', href: '/admin/permissions/requests', section: 'ADMIN', icon: <Shield className="h-4 w-4" /> },
    { id: 'admin-settings', label: 'Workspace settings', href: '/admin/settings', section: 'ADMIN', icon: <Settings className="h-4 w-4" /> },
  ],
};

export const ALL_SIDEBAR_ENTRIES = Object.values(NAV_TREE).flat();
// Compatibility export for route-level tests. New UI composes a per-rail tree.
export const SIDEBAR_ENTRIES = ALL_SIDEBAR_ENTRIES;

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    try { await fetchMe(); }
    catch (err) {
      if (err instanceof UnauthenticatedError) throw redirect({ to: '/login', search: { redirectTo: location.href } });
      throw err;
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate({ from: '/vocs' });
  const activeDomain = railForPathname(location.pathname);
  const managedSystemId = activeDomain === 'voc' || activeDomain === 'home'
    ? new URLSearchParams(location.searchStr).get('managedSystem') ?? undefined
    : undefined;
  const homeSummary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    enabled: activeDomain === 'home',
    queryFn: ({ signal }) => fetchDashboardSummary({ signal, ...(managedSystemId !== undefined ? { managedSystemId } : {}) }),
    retry: false,
  });
  const entries = React.useMemo(() => (activeDomain === 'home'
    ? homeSidebarEntries(homeSummary.data, location.pathname === '/home')
    : NAV_TREE[activeDomain].map((entry) => ({
    ...entry,
    active: entry.href.split('?')[0] === location.pathname && (entry.href.includes('view=') ? new URLSearchParams(entry.href.split('?')[1]).get('view') === new URLSearchParams(location.searchStr).get('view') : true),
  }))), [activeDomain, homeSummary.data, location.pathname, location.searchStr]);
  const changeManagedSystem = React.useCallback((managedSystemId: string | undefined) => {
    if (location.pathname !== '/vocs' && location.pathname !== '/home') return;
    void navigate({
      to: location.pathname === '/home' ? '/home' : '/vocs',
      search: (previous) => {
        const { managedSystem: _managedSystem, ...remaining } = previous;
        return managedSystemId === undefined
          ? remaining
          : { ...remaining, managedSystem: managedSystemId };
      },
    });
  }, [location.pathname, navigate]);
  const savedViewFilter = React.useMemo<Record<string, unknown> | undefined>(() => {
    if (activeDomain !== 'voc' || location.pathname !== '/vocs') return undefined;
    const current = new URLSearchParams(location.searchStr);
    const view = current.get('view') ?? 'inbox';
    const filter: Record<string, unknown> = { view };
    const managedSystem = current.get('managedSystem');
    if (managedSystem) filter.managed_system_id = managedSystem;
    for (const key of ['tab', 'sort', 'filter.severity', 'filter.owner'] as const) {
      const value = current.get(key);
      if (value) filter[key] = value;
    }
    const reporterStatus = current.get('filter.reporterStatus');
    if (reporterStatus) filter['filter.reporter_facing_status'] = reporterStatus;
    return filter;
  }, [activeDomain, location.pathname, location.searchStr]);
  const applySavedView = React.useCallback((view: SavedView) => {
    if (view.surface !== 'voc') return;
    const filter = view.filter;
    void navigate({
      to: '/vocs',
      // The persisted wire payload uses the backend's list schema. Translate
      // only at the existing route-search boundary; no second filtering path.
      search: {
        view: filter.view as 'inbox' | 'my' | 'triage',
        ...(typeof filter.managed_system_id === 'string' ? { managedSystem: filter.managed_system_id } : {}),
        ...(typeof filter.tab === 'string' ? { tab: filter.tab as never } : {}),
        ...(typeof filter.sort === 'string' ? { sort: filter.sort as never } : {}),
        ...(typeof filter['filter.severity'] === 'string' ? { 'filter.severity': filter['filter.severity'] } : {}),
        ...(typeof filter['filter.reporter_facing_status'] === 'string' ? { 'filter.reporterStatus': filter['filter.reporter_facing_status'] } : {}),
        ...(typeof filter['filter.owner'] === 'string' ? { 'filter.owner': filter['filter.owner'] } : {}),
      } as never,
    });
  }, [navigate]);
  return <AppFrame sidebarEntries={entries} activeDomain={activeDomain} {...(managedSystemId !== undefined ? { managedSystemId } : {})} syncManagedSystemFromUrl={activeDomain === 'voc' || activeDomain === 'home'} onManagedSystemChange={changeManagedSystem} {...(savedViewFilter !== undefined ? { savedViewFilter } : {})} onApplySavedView={applySavedView}><Outlet /></AppFrame>;
}
