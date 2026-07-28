import * as React from 'react';
import { DetailPanelSlotContext, cn } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { createSavedView, deleteSavedView, fetchManagedSystems, fetchNavCounts, fetchPermissionCheck, fetchSavedViews, type SavedView, type SavedViewSurface } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { AppRail, type RailDomain } from './AppRail';
import { AppSidebar, type SidebarNavEntry } from './AppSidebar';

export interface AppFrameProps {
  sidebarEntries: SidebarNavEntry[];
  activeDomain: RailDomain;
  managedSystemId?: string;
  /** VOC routes already encode this scope in their strict URL search schema. */
  syncManagedSystemFromUrl?: boolean;
  onManagedSystemChange?: (managedSystemId: string | undefined) => void;
  savedViewFilter?: Record<string, unknown>;
  onApplySavedView?: (view: SavedView) => void;
  /** The shell-rendered route content. AppFrame is NOT itself a shell. */
  children: React.ReactNode;
  className?: string;
}

interface SlotEntry {
  key: string;
  node: React.ReactNode;
}

/**
 * App frame for authenticated routes. Composes Rail(52) + Sidebar(240/56) + shell outlet + DetailPanelSlot(440).
 *
 * NOT a shell — does NOT live in packages/ui. The shell taxonomy is fixed at exactly three
 * (PageShell / ListShell / WorkbenchShell per ADR-0020). AppFrame composes one of those as its outlet.
 */
export function AppFrame({ sidebarEntries, activeDomain, managedSystemId, syncManagedSystemFromUrl = false, onManagedSystemChange, savedViewFilter, onApplySavedView, children, className }: AppFrameProps) {
  const [slots, setSlots] = React.useState<SlotEntry[]>([]);
  const [selectedManagedSystemId, setSelectedManagedSystemId] = React.useState<string | undefined>(managedSystemId);
  React.useEffect(() => {
    if (syncManagedSystemFromUrl) setSelectedManagedSystemId(managedSystemId);
  }, [managedSystemId, syncManagedSystemFromUrl]);
  const me = useMe();
  const actor = me.data?.actor;
  const actorId = typeof actor?.id === 'string' ? actor.id : undefined;
  const roleLevel = actor?.role_level;
  const isAdmin = typeof roleLevel === 'string' && roleLevel.toLowerCase() === 'admin';
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'scope-selector'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const systemIds = systemsQuery.data?.items.map((system) => system.id) ?? [];
  const grantsQuery = useQuery({
    queryKey: ['managed-system-scope', actorId, systemIds] as const,
    enabled: actorId !== undefined && systemIds.length > 0 && !isAdmin,
    queryFn: async ({ signal }) => {
      const decisions = await Promise.all(systemIds.map(async (id) => [id, await fetchPermissionCheck('voc.read', { managedSystemId: id, signal })] as const));
      return new Set(decisions.filter(([, response]) => response.decision.allow).map(([id]) => id));
    },
    staleTime: 60_000,
    retry: false,
  });
  const countsQuery = useQuery({
    queryKey: ['nav-counts', selectedManagedSystemId] as const,
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
    retry: false,
  });
  const managedSystems = (systemsQuery.data?.items ?? []).map((system) => ({
    id: system.id,
    name: system.name,
    granted: isAdmin || grantsQuery.data?.has(system.id) === true,
  }));
  const systemMeta: Record<RailDomain, { label: string; subtitle: string }> = {
    home: { label: 'Home', subtitle: '오늘의 운영 갭' },
    voc: { label: 'VOC', subtitle: 'Voice of Customer' },
    findings: { label: 'Findings', subtitle: 'Evidence → Execution' },
    tasks: { label: 'Tasks', subtitle: 'Execution' },
    integration: { label: 'Integration', subtitle: 'Coverage & Recovery' },
    surveys: { label: 'Surveys', subtitle: 'Discovery · Validation · Outcome' },
    admin: { label: 'Admin', subtitle: 'Workspace' },
  };
  const changeManagedSystem = React.useCallback((managedSystemId: string | undefined) => {
    setSelectedManagedSystemId(managedSystemId);
    onManagedSystemChange?.(managedSystemId);
  }, [onManagedSystemChange]);
  const counts = countsQuery.data?.counts;
  const savedViews = savedViewsQuery.data?.items ?? [];
  const saveCurrentView = React.useCallback((name: string) => {
    if (activeDomain !== 'voc' || savedViewFilter === undefined) return;
    void createSavedView({ surface: 'voc', name, filter: savedViewFilter }).then(() => savedViewsQuery.refetch());
  }, [activeDomain, savedViewFilter, savedViewsQuery]);
  const deleteCurrentView = React.useCallback((id: string) => {
    void deleteSavedView(id).then(() => savedViewsQuery.refetch());
  }, [savedViewsQuery]);
  const sidebarProps = {
    entries: sidebarEntries,
    systemLabel: systemMeta[activeDomain].label,
    systemSubtitle: systemMeta[activeDomain].subtitle,
    managedSystems,
    isAdmin,
    onManagedSystemChange: changeManagedSystem,
    ...(counts !== undefined ? { counts } : {}),
    ...(selectedManagedSystemId !== undefined ? { selectedManagedSystemId } : {}),
    savedViews,
    canSaveView: activeDomain === 'voc' && savedViewFilter !== undefined,
    onSaveView: saveCurrentView,
    onApplySavedView: (id: string) => {
      const view = savedViews.find((candidate) => candidate.id === id);
      if (view) onApplySavedView?.(view);
    },
    onDeleteSavedView: deleteCurrentView,
  };

  const setContent = React.useCallback((key: string, node: React.ReactNode) => {
    setSlots((prev) => {
      const filtered = prev.filter((s) => s.key !== key);
      if (filtered.length > 0 && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[AppFrame] DetailPanelSlot already has a registrant. New registration "${key}" overrides previous keys: ${filtered.map((s) => s.key).join(', ')}. Only one shell should forward detailPanel per route.`,
        );
      }
      return [...filtered, { key, node }];
    });
  }, []);

  const clear = React.useCallback((key: string) => {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const slotNode = slots[slots.length - 1]?.node;
  const slotOpen = slotNode !== undefined && slotNode !== null;

  // Memoize context value so shells' useDetailPanelSlot effect does not re-fire
  // on every AppFrame re-render. Without this, ctx reference changes each render
  // → effect re-runs → setContent → setState → re-render → infinite loop.
  const ctxValue = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);

  return (
    <DetailPanelSlotContext.Provider value={ctxValue}>
      <div className={cn('flex h-screen bg-surface-canvas text-text-primary', className)} data-app-frame>
        <AppRail activeDomain={activeDomain} />
        <AppSidebar {...sidebarProps} />
        <main className="flex-1 min-w-0 flex flex-col" data-testid="app-main">
          {children}
        </main>
        <aside
          className={cn(
            'border-l border-border-subtle bg-surface-detail overflow-y-auto transition-[width] duration-150',
            slotOpen ? '' : 'w-0',
          )}
          aria-label="Detail panel"
          data-testid="app-detail-slot"
          data-open={slotOpen ? 'true' : 'false'}
          style={
            slotOpen
              ? { width: 'var(--detail-panel-width)', minWidth: 360, maxWidth: 520 }
              : undefined
          }
        >
          {slotOpen && slotNode}
        </aside>
      </div>
    </DetailPanelSlotContext.Provider>
  );
}
