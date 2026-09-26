import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { listMilestones } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { MilestoneStatusFilter } from '@fops/shared';
import {
  Button,
  DirtyConfirmation,
  Input,
  ListShell,
  ListToolbar,
  type ListToolbarTab,
  PermissionBlockedPanel,
} from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Activity, Filter, Plus, Search } from 'lucide-react';
import * as React from 'react';
import { MilestoneCreatePanel, MilestoneDetailPanel } from '../components/MilestoneDetailPanel';
import { MilestoneRow } from '../components/MilestoneRow';

// #514 B2c — /tasks?view=milestones list screen: toolbar (status tabs All /
// In progress / Planning / Released, local search, inert Filter), summary
// strip, and MilestoneRow rows, mirroring
// docs/design-prototype/screen-milestones.jsx MilestonesScreen. The detail
// panel is B2d; B2e wires New milestone to the same property block in a
// create state — no separate create screen. Slice C (per-row mini timeline,
// Gantt) is out of this slice — the summary keeps the prototype's
// schedule-risk label only.
// Selection rides `param` like every shipped Task view (design §7 item 8);
// there is no `selected` key on /tasks.
export interface MilestonesRouteProps {
  selectedParam?: string | undefined;
  managedSystem?: string;
}

type MilestoneTab = MilestoneStatusFilter | 'all';

// GET /analytics-areas caps limit at 500; paginate rather than raise it (F4).
const ANALYTICS_AREAS_PAGE_LIMIT = 500;

// No Blocked tab: this slice has no backing blocked filter decision; Blocked
// still appears as a row badge (MilestoneStatusBadge).
const STATUS_TABS: Array<{ value: MilestoneTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'planning', label: 'Planning' },
  { value: 'released', label: 'Released' },
];

export function MilestonesRoute({ selectedParam, managedSystem }: MilestonesRouteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<MilestoneTab>('all');
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedParam ?? null);
  // B2e — the create block is a state of the detail slot, not a route: while
  // it is open the same property block renders in a create state.
  const [creating, setCreating] = React.useState(false);
  // B2e fixup — a dirty create form must confirm before a selection (existing
  // row or changed URL param) discards it; the switch applies only on confirm.
  const [createDirty, setCreateDirty] = React.useState(false);
  const [pendingSelection, setPendingSelection] = React.useState<string | null>(null);
  const [selectionConfirmOpen, setSelectionConfirmOpen] = React.useState(false);

  const prevParamRef = React.useRef(selectedParam);
  React.useEffect(() => {
    // Only an actual param change applies — the mount state is already in
    // sync, and reruns caused by the guard state below must not reopen the
    // confirmation for an unchanged URL.
    const changed = prevParamRef.current !== selectedParam;
    prevParamRef.current = selectedParam;
    if (!changed) return;
    // URL selection is authoritative in both directions: a param selects the
    // row, and Back to a param-less URL clears the stale highlight (F2).
    // B2e fixup — create mode never masks the change: a clean form switches
    // immediately, a dirty form waits for the discard confirmation.
    if (creating) {
      if (createDirty) {
        setPendingSelection(selectedParam ?? null);
        setSelectionConfirmOpen(true);
        return;
      }
      setCreating(false);
    }
    setSelectedId(selectedParam ?? null);
  }, [selectedParam, creating, createDirty]);

  const listQuery = useQuery({
    queryKey: ['milestones', 'list', managedSystem ?? null, activeTab] as const,
    queryFn: ({ signal }) =>
      listMilestones({
        signal,
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
        ...(activeTab !== 'all' ? { status: activeTab } : {}),
      }),
    staleTime: 30 * 1000,
  });

  // Tab badges and the summary strip read a real unfiltered list response so
  // counts never depend on the active status tab (LinksRoute count pattern).
  const countQuery = useQuery({
    queryKey: ['milestones', 'counts', managedSystem ?? null] as const,
    queryFn: ({ signal }) =>
      listMilestones({
        signal,
        ...(managedSystem !== undefined ? { managed_system_id: managedSystem } : {}),
      }),
    staleTime: 30 * 1000,
  });

  const { actors } = useWorkspaceActors();
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  // Area display lookup must resolve every linked Area: archived Areas stay
  // referenced by existing Milestones, and the endpoint paginates (default
  // page < catalog), so walk all pages instead of trusting one response (F4).
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', 'all', { includeArchived: true, paginated: true }] as const,
    queryFn: async ({ signal }) => {
      const first = await fetchAnalyticsAreas({
        includeArchived: true,
        limit: ANALYTICS_AREAS_PAGE_LIMIT,
        offset: 0,
        signal,
      });
      const items = [...first.items];
      let total = first.total;
      while (items.length < total) {
        const next = await fetchAnalyticsAreas({
          includeArchived: true,
          limit: ANALYTICS_AREAS_PAGE_LIMIT,
          offset: items.length,
          signal,
        });
        if (next.items.length === 0) break;
        items.push(...next.items);
        total = next.total;
      }
      return { items, total };
    },
    staleTime: 10 * 60 * 1000,
  });

  const items = listQuery.data?.items ?? [];
  const countItems = countQuery.data?.items ?? [];
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const managedSystemNamesById = React.useMemo(
    () => new Map((managedSystemsQuery.data?.items ?? []).map((ms) => [ms.id, ms.name])),
    [managedSystemsQuery.data?.items],
  );
  const analyticsAreaNamesById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );

  // Search filters the already-fetched rows locally; it never reaches the URL
  // or the API as a `q` param (no backing server-side filter in this slice).
  const shown = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return items;
    return items.filter((milestone) =>
      [milestone.title, milestone.display_id, milestone.why].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [items, search]);

  const summary = React.useMemo(
    () => ({
      total: countItems.length,
      inFlight: countItems.reduce((acc, milestone) => acc + milestone.progress.in_flight, 0),
      released: countItems.filter((milestone) => milestone.status === 'released').length,
    }),
    [countItems],
  );

  const tabs = React.useMemo<ListToolbarTab[]>(
    () =>
      STATUS_TABS.map((tab) => ({
        ...tab,
        badgeCount:
          tab.value === 'all'
            ? countItems.length
            : countItems.filter((milestone) => milestone.status === tab.value).length,
      })),
    [countItems],
  );

  function applySelection(id: string): void {
    setSelectedId(id);
    // Preserve the current Managed System scope in the URL so selection never
    // broadens the list or summary (F1; routes-and-layout list-context rule).
    void navigate({
      to: '/tasks',
      search: {
        view: 'milestones',
        param: id,
        ...(managedSystem !== undefined ? { managedSystem } : {}),
      },
    });
  }

  function selectMilestone(id: string): void {
    // B2e fixup — accepting an existing row replaces create state; a dirty
    // create form confirms first and stays open with its draft while declined.
    if (creating) {
      if (createDirty) {
        setPendingSelection(id);
        setSelectionConfirmOpen(true);
        return;
      }
      setCreating(false);
    }
    applySelection(id);
  }

  function confirmSelectionChange(): void {
    const id = pendingSelection;
    setSelectionConfirmOpen(false);
    setPendingSelection(null);
    setCreating(false);
    setSelectedId(id);
    if (id !== null && id !== selectedParam) applySelection(id);
  }

  // Close clears the selection (param drops from the URL) and never widens
  // the list: the Managed System scope rides along unchanged.
  function closeMilestone(): void {
    setSelectedId(null);
    void navigate({
      to: '/tasks',
      search: {
        view: 'milestones',
        ...(managedSystem !== undefined ? { managedSystem } : {}),
      },
    });
  }

  if (listQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Milestones…</div>;
  }
  if (isPermissionDenied(listQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Milestone list"
        reason={listQuery.error.message}
        className="m-4"
      />
    );
  }
  if (listQuery.error) {
    return <div className="p-4 text-sm text-accent-danger">Milestone list unavailable.</div>;
  }

  return (
    <>
      <ListShell
        list={
          <>
            <ListToolbar
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={(next) => setActiveTab(next as MilestoneTab)}
              action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <Input
                      aria-label="Milestone 검색"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Milestone 검색…"
                      className="w-56 pl-9"
                    />
                  </div>
                  {/* Filter intentionally opens no menu in this slice. */}
                  <Button variant="subtle" size="sm" className="gap-1.5">
                    <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                    Filter
                  </Button>
                  {/* B2e — opens the property block in a create state in the
                    detail slot; no separate create screen. */}
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setCreating(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    New milestone
                  </Button>
                </div>
              }
            />

            {/* Summary strip above the list; values come from the unfiltered list.
              Evidence linked is pinned to exactly 0 — the list DTO carries no
              evidence field (approved B2c plan). Slice C owns the per-row mini
              timeline, so only the prototype's schedule-risk label renders. */}
            <div
              className="flex items-stretch gap-[18px] border-b border-border-subtle bg-surface-canvas px-5 py-3"
              data-testid="milestones-summary"
            >
              <SummaryCell
                label="Milestones"
                value={summary.total}
                testId="milestone-summary-total"
              />
              <SummaryDivider />
              <SummaryCell
                label="Tasks in flight"
                value={summary.inFlight}
                valueClassName="text-accent-primary"
                testId="milestone-summary-in-flight"
              />
              <SummaryDivider />
              <SummaryCell
                label="Evidence linked"
                value={0}
                testId="milestone-summary-evidence-linked"
              />
              <SummaryDivider />
              <SummaryCell
                label="Released"
                value={summary.released}
                valueClassName="text-success"
                testId="milestone-summary-released"
              />
              <div className="flex-1" />
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                Schedule risk · mini-timeline 우측 표시
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((milestone) => {
                const areaName =
                  milestone.analytics_area_id !== null
                    ? analyticsAreaNamesById.get(milestone.analytics_area_id)
                    : undefined;
                const ownerName = actorNamesById.get(milestone.owner_actor_id);
                return (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    selected={milestone.id === selectedId}
                    managedSystemName={
                      managedSystemNamesById.get(milestone.primary_managed_system_id) ??
                      'Managed System'
                    }
                    {...(areaName !== undefined ? { areaName } : {})}
                    {...(ownerName !== undefined ? { owner: { display_name: ownerName } } : {})}
                    onSelect={selectMilestone}
                  />
                );
              })}
              {shown.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-text-muted">
                  표시할 milestone 이 없습니다.
                </div>
              )}
            </div>
          </>
        }
        // B2d: the selected row stays in the list; the panel fills the existing
        // right detail slot (routes-and-layout list/detail rule). B2e: the
        // create block takes the same slot until it is submitted or cancelled.
        detailPanel={
          creating ? (
            <MilestoneCreatePanel
              managedSystems={(managedSystemsQuery.data?.items ?? []).map(({ id, name }) => ({
                id,
                name,
              }))}
              analyticsAreas={(analyticsAreasQuery.data?.items ?? []).map(({ id, name }) => ({
                id,
                name,
              }))}
              actors={(actors ?? []).map(({ id, display_name }) => ({ id, display_name }))}
              defaultManagedSystemId={
                managedSystem !== undefined && managedSystem !== 'all' ? managedSystem : null
              }
              onCreated={(createdId) => {
                setCreating(false);
                // The list refetches so the new row appears; selection rides the
                // existing `param` key with the Managed System scope preserved.
                // No discard confirm: success consumes the form, it is not lost.
                void queryClient.invalidateQueries({ queryKey: ['milestones'] });
                applySelection(createdId);
              }}
              onDirtyChange={setCreateDirty}
              onCancel={() => setCreating(false)}
            />
          ) : selectedId ? (
            <MilestoneDetailPanel
              milestoneId={selectedId}
              onClose={closeMilestone}
              actorNamesById={actorNamesById}
              managedSystemNamesById={managedSystemNamesById}
              analyticsAreaNamesById={analyticsAreaNamesById}
            />
          ) : undefined
        }
      />
      {/* B2e fixup — confirming the pending switch discards the create draft
          and selects the requested record; declining keeps the create form. */}
      <DirtyConfirmation
        open={selectionConfirmOpen}
        onConfirm={confirmSelectionChange}
        onCancel={() => {
          setSelectionConfirmOpen(false);
          setPendingSelection(null);
        }}
      />
    </>
  );
}

function SummaryCell({
  label,
  value,
  valueClassName = '',
  testId,
}: {
  label: string;
  value: number;
  valueClassName?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-text-muted">{label}</span>
      <span
        className={`text-base font-semibold tabular-nums ${valueClassName}`}
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryDivider() {
  return <div className="w-px self-stretch bg-border-subtle" aria-hidden="true" />;
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
