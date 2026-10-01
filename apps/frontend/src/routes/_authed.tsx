import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import {
  Activity,
  Database,
  FileBarChart,
  Flag,
  Inbox,
  Layers,
  Link2,
  ListChecks,
  ListTodo,
  Plus,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import * as React from 'react';
import { homeSidebarEntries } from '../features/home/homeNavigation';
import { UnauthenticatedError, fetchDashboardSummary } from '../lib/api';
import type { SavedView } from '../lib/api';
import { ensureMe, useMe } from '../lib/auth/useMe';
import { VOC_INBOX_NO_LINK_TAB_LABEL, VOC_TRIAGE_TAB_LABELS } from '../lib/copy/voc-views';
import {
  AuthenticatedRouteErrorFallback,
  AuthenticatedRoutePendingFallback,
} from '../lib/layout/RouteFallback';
import { AppFrame } from '../lib/layout/AppFrame';
import { type RailDomain, railForPathname } from '../lib/layout/AppRail';
import type { SidebarNavEntry } from '../lib/layout/AppSidebar';
import type { AppRouterContext } from './__root';
import { VOC_DEFAULT_VIEW } from './_authed/vocs';

const SIDEBAR_ROUTE_DEFAULT_VIEWS: Record<string, string> = {
  '/vocs': VOC_DEFAULT_VIEW,
};

export const NAV_TREE: Record<Exclude<RailDomain, 'home'>, SidebarNavEntry[]> = {
  voc: [
    {
      id: 'inbox',
      label: 'Inbox',
      href: '/vocs?view=inbox',
      section: 'VOC',
      icon: <Inbox className="h-4 w-4" />,
      countKey: 'voc.inbox',
    },
    {
      id: 'triage',
      label: 'Triage',
      href: '/vocs?view=triage',
      section: 'VOC',
      icon: <Flag className="h-4 w-4" />,
      countKey: 'voc.triage',
    },
    {
      id: 'my-vocs',
      label: 'My VOCs',
      href: '/vocs?view=my',
      section: 'VOC',
      icon: <User className="h-4 w-4" />,
      countKey: 'voc.my',
    },
    {
      id: 'voc-clusters',
      label: 'Clusters',
      href: '/voc-clusters',
      section: 'VOC',
      icon: <Layers className="h-4 w-4" />,
      countKey: 'voc.clusters',
    },
    {
      id: 'create',
      label: 'New VOC',
      href: '/vocs?action=create',
      section: 'VOC',
      icon: <Plus className="h-4 w-4" />,
    },
    {
      id: 'high-severity',
      label: VOC_TRIAGE_TAB_LABELS.high,
      href: '/vocs?view=triage&tab=high',
      // #680 follows the accepted Korean-first labels where the prototype says "VIEWS".
      section: 'Triage 보기',
      parentId: 'triage',
      icon: <Flag className="h-4 w-4" />,
      countKey: 'voc.tab.high',
    },
    {
      id: 'unassigned',
      label: VOC_TRIAGE_TAB_LABELS.unassigned,
      href: '/vocs?view=triage&tab=unassigned',
      section: 'Triage 보기',
      parentId: 'triage',
      icon: <User className="h-4 w-4" />,
      countKey: 'voc.tab.unassigned',
      urgent: true,
    },
    {
      id: 'no-link',
      label: VOC_INBOX_NO_LINK_TAB_LABEL,
      href: '/vocs?view=inbox&tab=no-link',
      section: '보기',
      icon: <Link2 className="h-4 w-4" />,
      countKey: 'voc.inbox.no-link',
    },
  ],
  findings: [
    {
      id: 'findings',
      label: 'All findings',
      href: '/findings',
      section: 'FINDINGS',
      icon: <ListChecks className="h-4 w-4" />,
      countKey: 'findings.all',
    },
  ],
  tasks: [
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
    {
      id: 'milestones',
      label: 'Milestones',
      href: '/tasks?view=milestones',
      section: 'TASKS',
      icon: <Flag className="h-4 w-4" />,
    },
  ],
  integration: [
    {
      id: 'integration-dashboard',
      label: 'Action dashboard',
      href: '/integration',
      section: 'INTEGRATION',
      icon: <Activity className="h-4 w-4" />,
    },
    { id: 'integration-findings', label: 'Findings', href: '/findings', section: 'INTEGRATION', icon: <ListChecks className="h-4 w-4" />, countKey: 'findings.all' },
    { id: 'integration-links', label: 'Entity links', href: '/integration/links', section: 'INTEGRATION', icon: <Link2 className="h-4 w-4" /> },
    { id: 'integration-coverage', label: 'Coverage', href: '/integration/coverage', section: 'INTEGRATION', icon: <Layers className="h-4 w-4" /> },
  ],
  surveys: [
    {
      id: 'surveys',
      label: 'All surveys',
      href: '/surveys',
      section: 'SURVEYS',
      icon: <FileBarChart className="h-4 w-4" />,
      countKey: 'surveys.all',
    },
  ],
  admin: [
    {
      id: 'admin-ms',
      label: 'Managed Systems',
      href: '/admin/managed-systems',
      section: 'ADMIN',
      icon: <Database className="h-4 w-4" />,
    },
    {
      id: 'admin-aa',
      label: 'Analytics Areas',
      href: '/admin/analytics-areas',
      section: 'ADMIN',
      icon: <Layers className="h-4 w-4" />,
    },
    {
      id: 'admin-permissions',
      label: 'Permission requests',
      href: '/admin/permissions/requests',
      section: 'ADMIN',
      icon: <Shield className="h-4 w-4" />,
    },
    {
      id: 'admin-settings',
      label: 'Workspace settings',
      href: '/admin/settings',
      section: 'ADMIN',
      icon: <Settings className="h-4 w-4" />,
    },
  ],
};

export const ALL_SIDEBAR_ENTRIES = Object.values(NAV_TREE).flat();
// Compatibility export for route-level tests. New UI composes a per-rail tree.
export const SIDEBAR_ENTRIES = ALL_SIDEBAR_ENTRIES;

export function isSidebarEntryActive(
  entry: SidebarNavEntry,
  pathname: string,
  searchStr: string,
): boolean {
  const [entryPath = '', entrySearch] = entry.href.split('?');
  if (entryPath !== pathname) {
    if (entry.id === 'integration-dashboard' || !pathname.startsWith(`${entryPath}/`)) {
      return false;
    }
  }
  const entryParams = new URLSearchParams(entrySearch);
  if (entryParams.has('action')) return false;

  const currentParams = new URLSearchParams(searchStr);
  const defaultView = SIDEBAR_ROUTE_DEFAULT_VIEWS[entryPath];
  for (const [key, expectedValue] of entryParams) {
    // #606 follows each route's default view; New VOC is an action, so its URL resolves to Inbox.
    const actualValue =
      key === 'view' ? (currentParams.get(key) ?? defaultView) : currentParams.get(key);
    if (actualValue !== expectedValue) return false;
  }
  return true;
}

export function getSidebarEntryStates(
  entries: SidebarNavEntry[],
  pathname: string,
  searchStr: string,
): SidebarNavEntry[] {
  const matchingEntries = entries.filter((entry) =>
    isSidebarEntryActive(entry, pathname, searchStr),
  );
  const currentEntries = matchingEntries.filter(
    (entry) =>
      !matchingEntries.some(
        (candidate) =>
          candidate.id !== entry.id && isMoreSpecificSidebarEntry(candidate, entry),
      ),
  );
  const currentIds = new Set(currentEntries.map((entry) => entry.id));
  const contextualIds = new Set(
    currentEntries.flatMap((entry) => (entry.parentId === undefined ? [] : [entry.parentId])),
  );

  return entries.map((entry) => ({
    ...entry,
    active: currentIds.has(entry.id),
    contextActive: contextualIds.has(entry.id),
  }));
}

function isMoreSpecificSidebarEntry(candidate: SidebarNavEntry, entry: SidebarNavEntry): boolean {
  const [candidatePath = '', candidateSearch] = candidate.href.split('?');
  const [entryPath, entrySearch] = entry.href.split('?');
  if (candidatePath !== entryPath) return candidatePath.startsWith(`${entryPath}/`);

  const candidateParams = new URLSearchParams(candidateSearch);
  const entryParams = new URLSearchParams(entrySearch);
  const candidateParamCount = [...candidateParams].length;
  const entryParamCount = [...entryParams].length;
  return (
    candidateParamCount > entryParamCount &&
    [...entryParams].every(([key, value]) => candidateParams.get(key) === value)
  );
}

export const Route = createFileRoute('/_authed')({
  beforeLoad: authenticatedBeforeLoad,
  component: AuthedLayout,
  errorComponent: AuthenticatedRouteErrorFallback,
  pendingComponent: AuthenticatedRoutePendingFallback,
});

export async function authenticatedBeforeLoad({
  context,
  location,
}: {
  context: AppRouterContext;
  location: { href: string };
}): Promise<void> {
  try {
    await ensureMe(context.queryClient);
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      throw redirect({ to: '/login', search: { redirectTo: location.href } });
    throw err;
  }
}

export function AuthedLayout() {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate({ from: '/vocs' });
  const queryClient = useQueryClient();
  const me = useMe();
  const activeDomain = railForPathname(location.pathname);
  React.useEffect(() => {
    if (!(me.error instanceof UnauthenticatedError)) return;
    queryClient.clear();
    void navigate({
      to: '/login',
      search: { redirectTo: location.href },
      replace: true,
    });
  }, [location.href, me.error, navigate, queryClient]);
  // Every domain except Admin already reads/scopes by its own `managedSystem`
  // URL param (docs/frontend/routes-and-layout.md §URL State Rules): VOC,
  // VOC Clusters, Findings, Tasks (every view), Surveys, Integration
  // (Links/Coverage). Admin's four sub-routes only partially support it
  // (Analytics Areas does, Managed Systems/Permission Requests/Settings do
  // not), so it stays out of the shared sidebar selector for now (#518).
  const supportsManagedSystemScope = activeDomain !== 'admin';
  const managedSystemId = supportsManagedSystemScope
    ? (new URLSearchParams(location.searchStr).get('managedSystem') ?? undefined)
    : undefined;
  const homeSummary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    enabled: activeDomain === 'home',
    queryFn: ({ signal }) =>
      fetchDashboardSummary({
        signal,
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      }),
    retry: false,
  });
  const entries = React.useMemo(
    () =>
      activeDomain === 'home'
        ? homeSidebarEntries(homeSummary.data, location.pathname === '/home')
        : getSidebarEntryStates(NAV_TREE[activeDomain], location.pathname, location.searchStr),
    [activeDomain, homeSummary.data, location.pathname, location.searchStr],
  );
  const changeManagedSystem = React.useCallback(
    (managedSystemId: string | undefined) => {
      if (!supportsManagedSystemScope) return;
      void navigate({
        to: location.pathname as never,
        search: (previous: Record<string, unknown>) => {
          const { managedSystem: _managedSystem, ...remaining } = previous;
          return managedSystemId === undefined
            ? remaining
            : { ...remaining, managedSystem: managedSystemId };
        },
      } as never);
    },
    [location.pathname, navigate, supportsManagedSystemScope],
  );
  const savedViewFilter = React.useMemo<Record<string, unknown> | undefined>(() => {
    if (activeDomain !== 'voc' || location.pathname !== '/vocs') return undefined;
    const current = new URLSearchParams(location.searchStr);
    const view = current.get('view') ?? VOC_DEFAULT_VIEW;
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
  const applySavedView = React.useCallback(
    (view: SavedView) => {
      if (view.surface !== 'voc') return;
      const filter = view.filter;
      void navigate({
        to: '/vocs',
        // The persisted wire payload uses the backend's list schema. Translate
        // only at the existing route-search boundary; no second filtering path.
        search: {
          view: filter.view as 'inbox' | 'my' | 'triage',
          ...(typeof filter.managed_system_id === 'string'
            ? { managedSystem: filter.managed_system_id }
            : {}),
          ...(typeof filter.tab === 'string' ? { tab: filter.tab as never } : {}),
          ...(typeof filter.sort === 'string' ? { sort: filter.sort as never } : {}),
          ...(typeof filter['filter.severity'] === 'string'
            ? { 'filter.severity': filter['filter.severity'] }
            : {}),
          ...(typeof filter['filter.reporter_facing_status'] === 'string'
            ? { 'filter.reporterStatus': filter['filter.reporter_facing_status'] }
            : {}),
          ...(typeof filter['filter.owner'] === 'string'
            ? { 'filter.owner': filter['filter.owner'] }
            : {}),
        } as never,
      });
    },
    [navigate],
  );
  return (
    <AppFrame
      sidebarEntries={entries}
      activeDomain={activeDomain}
      {...(managedSystemId !== undefined ? { managedSystemId } : {})}
      syncManagedSystemFromUrl={supportsManagedSystemScope}
      scopeControlEnabled={supportsManagedSystemScope}
      onManagedSystemChange={changeManagedSystem}
      {...(savedViewFilter !== undefined ? { savedViewFilter } : {})}
      onApplySavedView={applySavedView}
    >
      <Outlet />
    </AppFrame>
  );
}
