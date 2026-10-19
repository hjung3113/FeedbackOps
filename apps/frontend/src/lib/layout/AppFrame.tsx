import {
  type SavedView,
  type SavedViewSurface,
  createSavedView,
  deleteSavedView,
  fetchCapabilityScope,
  fetchManagedSystems,
  fetchNavCounts,
  fetchSavedViews,
} from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { NAV_COUNTS_QUERY_KEY } from '@/lib/query/navCounts';
import { allowedPlatformReturnHref } from '@/lib/router/platform-return';
import {
  DetailPanelFullscreenContext,
  DetailPanelReadingColumn,
  DetailPanelSlotProvider,
  cn,
  useDetailPanelSlotHost,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { AppRail, type RailDomain } from './AppRail';
import { AppSidebar, type SidebarNavItem } from './AppSidebar';
import { CommandPalette } from './command-palette/CommandPalette';
import type { PaletteNavTree } from './command-palette/commands';

export interface AppFrameProps {
  sidebarEntries: SidebarNavItem[];
  activeDomain: RailDomain;
  /** Raw `platformReturn` of the committed leaf route (ADR-0071); checked against the allowlist here. */
  platformReturn?: string;
  /**
   * NAV_TREE passthrough that arms the global command palette (#611). Routes
   * that do not pass it (e.g. RouteFallback's error frame) get no palette.
   */
  paletteNavTree?: PaletteNavTree;
  managedSystemId?: string;
  /** VOC routes already encode this scope in their strict URL search schema. */
  syncManagedSystemFromUrl?: boolean;
  /** False on a route whose data is not scoped by Managed System (e.g. most of Admin). */
  scopeControlEnabled?: boolean;
  onManagedSystemChange?: (managedSystemId: string | undefined) => void;
  savedViewFilter?: Record<string, unknown>;
  onApplySavedView?: (view: SavedView) => void;
  /** The shell-rendered route content. AppFrame is NOT itself a shell. */
  children: React.ReactNode;
  className?: string;
}

/**
 * App frame for authenticated routes. Composes Rail(52) + Sidebar(240/56) + shell outlet + DetailPanelSlot(440).
 *
 * NOT a shell — does NOT live in packages/ui. The shell taxonomy is fixed at exactly three
 * (PageShell / ListShell / WorkbenchShell per ADR-0020). AppFrame composes one of those as its outlet.
 */
export function AppFrame(props: AppFrameProps) {
  return (
    <DetailPanelSlotProvider>
      <AppFrameBody {...props} />
    </DetailPanelSlotProvider>
  );
}

function AppFrameBody({ sidebarEntries, activeDomain, paletteNavTree, platformReturn, managedSystemId, syncManagedSystemFromUrl = false, scopeControlEnabled = true, onManagedSystemChange, savedViewFilter, onApplySavedView, children, className }: AppFrameProps) {
  const [selectedManagedSystemId, setSelectedManagedSystemId] = React.useState<string | undefined>(managedSystemId);
  React.useEffect(() => {
    if (syncManagedSystemFromUrl) setSelectedManagedSystemId(managedSystemId);
  }, [managedSystemId, syncManagedSystemFromUrl]);
  const { ref: slotHostRef, open: slotOpen, expanded: isExpanded, toggle: toggleSlot } = useDetailPanelSlotHost();
  // The provider hands `DetailPanelFullscreenContext` only to the portaled panel; the reading
  // column sits outside it, so it gets the host's own view of the same state.
  const columnContextValue = React.useMemo(
    () => ({ expanded: isExpanded, toggle: toggleSlot }),
    [isExpanded, toggleSlot],
  );
  const me = useMe();
  const actor = me.data?.actor;
  const workspaceAdminCheck = usePermissionCheck({ capability: 'workspace.admin' });
  const canAccessWorkspaceAdmin = workspaceAdminCheck.data?.state === 'approved';
  // ADR-0056 makes Admin discovery capability-based; route PermissionGates remain authoritative.
  const visibleSidebarEntries = canAccessWorkspaceAdmin
    ? sidebarEntries
    : sidebarEntries.filter((entry) => entry.section !== '관리자');
  const actorId = typeof actor?.id === 'string' ? actor.id : undefined;
  const roleLevel = actor?.role_level;
  const isAdmin = typeof roleLevel === 'string' && roleLevel.toLowerCase() === 'admin';
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'scope-selector'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const grantsQuery = useQuery({
    queryKey: ['managed-system-scope', actorId, 'voc.read'] as const,
    enabled: actorId !== undefined,
    queryFn: ({ signal }) => fetchCapabilityScope('voc.read', { signal }),
    staleTime: 60_000,
    retry: false,
  });
  const awaitingInitialScope =
    actorId !== undefined &&
    grantsQuery.data === undefined &&
    grantsQuery.fetchStatus === 'fetching';
  const countsQuery = useQuery({
    queryKey: [...NAV_COUNTS_QUERY_KEY, selectedManagedSystemId] as const,
    queryFn: ({ signal }) => fetchNavCounts({
      signal,
      ...(selectedManagedSystemId !== undefined ? { managedSystemId: selectedManagedSystemId } : {}),
    }),
    retry: false,
  });
  const savedViewSurface: SavedViewSurface | undefined = activeDomain === 'voc'
    ? 'voc'
    : activeDomain === 'tasks'
      ? 'tasks'
      : activeDomain === 'findings'
        ? 'findings'
        : undefined;
  const savedViewsQuery = useQuery({
    queryKey: ['saved-views', savedViewSurface] as const,
    queryFn: ({ signal }) => fetchSavedViews(savedViewSurface, signal),
    // Saved views are per-surface (#870): a domain without a saved-view surface
    // (home, surveys, integration, admin) must not fall back to the unscoped
    // list, which would surface other surfaces' views in its sidebar.
    enabled: savedViewSurface !== undefined,
    retry: false,
  });
  const managedSystems = (systemsQuery.data?.items ?? []).map((system) => ({
    id: system.id,
    name: system.name,
    // Keep the initial permission fetch from briefly marking every system out of scope.
    granted:
      awaitingInitialScope ||
      grantsQuery.data?.scope.kind === 'all' ||
      (grantsQuery.data?.scope.kind === 'scoped' &&
        grantsQuery.data.scope.managed_system_ids.includes(system.id)),
  }));
  const systemMeta: Record<RailDomain, { label: string; subtitle: string }> = {
    home: { label: '홈', subtitle: '오늘의 운영 갭' },
    voc: { label: 'VOC', subtitle: '고객 피드백' },
    findings: { label: 'Findings', subtitle: 'Evidence → 실행' },
    tasks: { label: 'Tasks', subtitle: '실행' },
    integration: { label: '연동', subtitle: '커버리지 · 복구' },
    surveys: { label: 'Surveys', subtitle: '탐색 · 검증 · 결과' },
    admin: { label: '관리자', subtitle: '워크스페이스' },
  };
  const changeManagedSystem = React.useCallback((managedSystemId: string | undefined) => {
    setSelectedManagedSystemId(managedSystemId);
    onManagedSystemChange?.(managedSystemId);
  }, [onManagedSystemChange]);
  const counts = countsQuery.data?.counts;
  const savedViews = savedViewSurface === undefined ? [] : (savedViewsQuery.data?.items ?? []);
  const saveCurrentView = React.useCallback((name: string) => {
    if (activeDomain !== 'voc' || savedViewFilter === undefined) return;
    void createSavedView({ surface: 'voc', name, filter: savedViewFilter }).then(() => savedViewsQuery.refetch());
  }, [activeDomain, savedViewFilter, savedViewsQuery]);
  const deleteCurrentView = React.useCallback((id: string) => {
    return deleteSavedView(id).then(() => savedViewsQuery.refetch());
  }, [savedViewsQuery]);
  const platformReturnUrl = allowedPlatformReturnHref(
    platformReturn,
    me.data?.platform_return_origins,
  );
  const sidebarProps = {
    entries: visibleSidebarEntries,
    ...(platformReturnUrl !== undefined ? { platformReturnUrl } : {}),
    systemLabel: systemMeta[activeDomain].label,
    systemSubtitle: systemMeta[activeDomain].subtitle,
    managedSystems,
    scopeControlEnabled,
    isAdmin,
    workspaceWideScope: isAdmin && (grantsQuery.data?.scope.kind === 'all' || awaitingInitialScope),
    onManagedSystemChange: changeManagedSystem,
    ...(counts !== undefined ? { counts } : {}),
    ...(selectedManagedSystemId !== undefined ? { selectedManagedSystemId } : {}),
    ...(savedViewSurface !== undefined ? { savedViewSurface } : {}),
    savedViews,
    canSaveView: activeDomain === 'voc' && savedViewFilter !== undefined,
    onSaveView: saveCurrentView,
    onApplySavedView: (id: string) => {
      const view = savedViews.find((candidate) => candidate.id === id);
      if (view) onApplySavedView?.(view);
    },
    onDeleteSavedView: deleteCurrentView,
  };

  return (
    <>
      <div className={cn('flex h-screen bg-surface-canvas text-text-primary', className)} data-app-frame>
        <AppRail
          activeDomain={activeDomain}
          canAccessWorkspaceAdmin={canAccessWorkspaceAdmin}
          {...(counts !== undefined ? { counts } : {})}
        />
        <AppSidebar {...sidebarProps} />
        <main
          className={cn('flex-1 min-w-0 flex flex-col', isExpanded && 'hidden')}
          data-testid="app-main"
          hidden={isExpanded}
        >
          {children}
        </main>
        <aside
          className={cn(
            'bg-surface-detail overflow-y-auto',
            // #862: expanded, the aside sits flush after the sidebar's border-r;
            // keep the seam line only while collapsed to avoid a 2px double line.
            !isExpanded && 'border-l border-border-subtle',
            slotOpen
              ? isExpanded
                ? 'flex-1 min-w-0'
                : 'w-(--detail-panel-width) min-w-90 max-w-130'
              : 'w-0',
          )}
          aria-label="상세 패널"
          data-testid="app-detail-slot"
          data-open={slotOpen ? 'true' : 'false'}
          data-expanded={isExpanded ? 'true' : 'false'}
        >
          {slotOpen && (
            <DetailPanelFullscreenContext.Provider value={columnContextValue}>
              <DetailPanelReadingColumn data-testid="app-detail-slot-column">
                <div ref={slotHostRef} className="contents" />
              </DetailPanelReadingColumn>
            </DetailPanelFullscreenContext.Provider>
          )}
        </aside>
        {paletteNavTree !== undefined && (
          <CommandPalette navTree={paletteNavTree} canAccessWorkspaceAdmin={canAccessWorkspaceAdmin} />
        )}
      </div>
    </>
  );
}
