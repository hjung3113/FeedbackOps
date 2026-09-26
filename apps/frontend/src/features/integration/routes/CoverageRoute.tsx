import {
  DASHBOARD_HOP_ROUTES,
  type DashboardActionQueueId,
  type DashboardCoverageId,
  type DashboardSummary,
} from '@fops/shared';
import {
  Button,
  Label,
  PageShell,
  PanelSectionTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Activity, AlertTriangle, Filter, RefreshCw, Shield } from 'lucide-react';
import * as React from 'react';

import { fetchAnalyticsAreas, fetchDashboardSummary, fetchManagedSystems } from '@/lib/api';
import { HOME_QUEUE_COPY } from '@/lib/copy/home';

type ByManagedSystemRow = DashboardSummary['by_managed_system'][number];
type ManagedSystemCoverageArea = NonNullable<ByManagedSystemRow['analytics_areas']>[number];
type PerSystemCoverageCell = NonNullable<ByManagedSystemRow['coverage']>['voc-task'];

/** The route's own search contract (links.tsx keeps the same local shape). */
interface CoverageSearch {
  managedSystem?: string;
}

// The prototype subtitle pitches editable thresholds (direction C, deferred);
// the integration guide requires the partial-integration-coverage label.
const PARTIAL_COVERAGE_SUBTITLE =
  'Partial integration coverage. 정책이 요구하는 연결만 표시합니다.';

// Coverage columns are the five rollup ratios; the queue columns are the five
// per-system queues. permission-requests-pending is workspace review, never a
// system row key (docs/implementation/api/dashboard.md), so it has no column.
type SystemCoverageColumn = Exclude<DashboardCoverageId, 'milestone-outcome'>;
const COVERAGE_COLUMNS: SystemCoverageColumn[] = [
  'voc-task',
  'finding-execution',
  'high-followup',
  'released-update',
  'analytics-area',
];
const QUEUE_COLUMNS: DashboardActionQueueId[] = [
  'unassigned-voc',
  'high-severity-unlinked',
  'actionable-finding-no-execution',
  'released-task-unresolved-voc',
  'bad-outcome-no-followup',
];

// /admin/permissions/requests has no managedSystem search key — its hop is
// workspace-level and must not grow the param (routes-and-layout.md).
const HOPS_WITHOUT_MANAGED_SYSTEM: ReadonlySet<string> = new Set(['permission-requests-pending']);

// milestone-outcome is never emitted and has no hop; a future id without a map
// entry renders as a non-link row instead of inventing a route.
function hopRoute(id: DashboardCoverageId | DashboardActionQueueId): string | undefined {
  return (DASHBOARD_HOP_ROUTES as Record<string, string | undefined>)[id];
}

function hopHref(
  route: string | undefined,
  rowId: string,
  managedSystem: string | undefined,
): string | undefined {
  if (route === undefined) return undefined;
  if (managedSystem === undefined || managedSystem === 'all') return route;
  if (HOPS_WITHOUT_MANAGED_SYSTEM.has(rowId)) return route;
  const url = new URL(route, 'http://localhost');
  url.searchParams.set('managedSystem', managedSystem);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

// Absent key = em dash; a permitted empty result is present with zero.
function coverageCellText(cell: PerSystemCoverageCell): string {
  return cell === undefined ? '—' : `${cell.value} / ${cell.total} · ${cell.percent}%`;
}

function queueCellText(count: number | undefined): string {
  return count === undefined ? '—' : String(count);
}

// Per-surface copy: the Coverage prototype specifies these metric labels
// (data.js CoverageMetrics), except high-followup which carries the
// plan-corrected wording (plan-513 copy table). Home keeps its own labels.
const COVERAGE_LABELS: Record<DashboardCoverageId, string> = {
  'voc-task': 'VOC linked to Task',
  'finding-execution': 'Active Finding with execution',
  'milestone-outcome': 'Milestone with outcome survey',
  'high-followup': 'High severity VOC follow-up',
  'released-update': 'Released Task with public update',
  'analytics-area': 'VOC with Analytics Area set',
};

// The server's 75/40 good/warn/bad band maps directly to presentation.
// No client-side thresholds (plan-513: direction C is out).
const COVERAGE_STATUS_TONE: Record<
  DashboardSummary['coverage'][number]['status'],
  { text: string; bar: string }
> = {
  good: { text: 'text-accent-success', bar: 'bg-accent-success' },
  warn: { text: 'text-accent-warn', bar: 'bg-accent-warn' },
  bad: { text: 'text-accent-danger', bar: 'bg-accent-danger' },
};

const SEVERITY_TONE: Record<
  DashboardSummary['action_queues'][number]['severity'],
  { icon: React.ReactNode; text: string; chip: string }
> = {
  urgent: {
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
    text: 'text-accent-danger',
    chip: 'bg-accent-danger/10 text-accent-danger',
  },
  warn: {
    icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" />,
    text: 'text-accent-warn',
    chip: 'bg-accent-warn/10 text-accent-warn',
  },
  info: {
    icon: <Shield className="h-3.5 w-3.5" aria-hidden="true" />,
    text: 'text-accent-info',
    chip: 'bg-accent-info/10 text-accent-info',
  },
};

export function CoverageRoute(): React.ReactElement {
  const search = useSearch({ strict: false }) as CoverageSearch;
  // `from` is what types the search reducer (see LinksRoute: without it the
  // reducer gets the router-wide search union and stops assigning).
  const navigate = useNavigate({ from: '/integration/coverage' });
  const queryClient = useQueryClient();
  const managedSystem = search.managedSystem;
  // all-scope convention: 'all' and an absent key both query WITHOUT
  // managed_system_id (apiClient defaults it to 'all').
  const managedSystemId =
    managedSystem !== undefined && managedSystem !== 'all' ? managedSystem : undefined;

  const summary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    queryFn: ({ signal }) =>
      fetchDashboardSummary({
        signal,
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      }),
    retry: false,
  });
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  const areasQuery = useQuery({
    queryKey: ['analytics-areas', { includeArchived: true }] as const,
    queryFn: ({ signal }) => fetchAnalyticsAreas({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const systemsById = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const system of systemsQuery.data?.items ?? []) out[system.id] = system.name;
    return out;
  }, [systemsQuery.data]);

  const areasById = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const area of areasQuery.data?.items ?? []) out[area.id] = area.name;
    return out;
  }, [areasQuery.data]);

  function handleFilterChange(value: string): void {
    void navigate({
      to: '/integration/coverage',
      search: (previous) => {
        const { managedSystem: _dropped, ...rest } = previous;
        // Defaults are omitted from the URL (routes-and-layout.md); the schema
        // still accepts an explicit all for deep links.
        return value === 'all' ? rest : { ...rest, managedSystem: value };
      },
    });
  }

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-summary', managedSystemId] });
  };

  const systemName = (id: string): string => systemsById[id] ?? id.slice(0, 8);

  // A successful response whose projections are all omitted is an
  // availability state, not an empty result set of zeros
  // (docs/implementation/api/dashboard.md: absence is not zero).
  const isEmptySummary =
    summary.data !== undefined &&
    summary.data.coverage.length === 0 &&
    summary.data.action_queues.length === 0 &&
    summary.data.by_managed_system.length === 0;

  return (
    <PageShell contentClassName="max-w-none">
      <section data-testid="integration-coverage">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">Coverage</h1>
            <p className="mt-3 text-sm text-text-muted">{PARTIAL_COVERAGE_SUBTITLE}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="subtle" size="sm" data-testid="coverage-filter-button">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="space-y-1.5">
                <Label htmlFor="coverage-filter-managed-system">Managed System</Label>
                <Select value={managedSystem ?? 'all'} onValueChange={handleFilterChange}>
                  <SelectTrigger
                    id="coverage-filter-managed-system"
                    data-testid="coverage-filter-managed-system"
                  >
                    <SelectValue placeholder="All Managed Systems" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Managed Systems</SelectItem>
                    {(systemsQuery.data?.items ?? []).map((system) => (
                      <SelectItem key={system.id} value={system.id}>
                        {system.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PopoverContent>
            </Popover>
            <Button variant="subtle" size="sm" onClick={refresh} data-testid="coverage-refresh">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </header>
        {summary.isError && (
          <p className="mb-5 text-sm text-accent-danger">Coverage summary unavailable.</p>
        )}

        {summary.isPending ? (
          <div className="space-y-2 p-4" data-testid="coverage-pending">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : summary.data === undefined ? null : isEmptySummary ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center"
            data-testid="coverage-empty"
          >
            <p className="text-sm font-medium text-text-primary">No coverage available</p>
            <p className="mt-2 text-sm text-text-muted">
              The dashboard returned no coverage or missing-link projections for this scope.
              Projections you cannot receive are omitted — that is not the same as zero.
            </p>
          </div>
        ) : (
          <>
            <PanelSectionTitle>Coverage signals</PanelSectionTitle>
            <div
              className="mb-8 overflow-hidden rounded-md border border-border-subtle bg-surface-card"
              data-testid="coverage-signals"
            >
              {(summary.data?.coverage ?? []).map((item) => {
                const href = hopHref(hopRoute(item.id), item.id, managedSystem);
                const tone = COVERAGE_STATUS_TONE[item.status];
                return (
                  <a
                    key={item.id}
                    {...(href !== undefined ? { href } : {})}
                    data-testid={`coverage-row-${item.id}`}
                    className={`grid items-center gap-4 border-b border-border-subtle px-4 py-3 last:border-b-0 hover:bg-surface-row-hover${href === undefined ? ' pointer-events-none' : ''}`}
                    style={{ gridTemplateColumns: 'minmax(0,1fr) 110px minmax(0,1fr) 56px' }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {COVERAGE_LABELS[item.id]}
                      </div>
                      <div className="truncate font-mono text-xs text-text-muted">{item.id}</div>
                    </div>
                    <div className="text-right text-xs tabular-nums text-text-muted">
                      {item.value} / {item.total}
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-row-selected">
                      <div
                        data-testid={`coverage-bar-fill-${item.id}`}
                        className={`h-1.5 rounded-full ${tone.bar}`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <div
                      data-testid={`coverage-percent-${item.id}`}
                      className={`text-right text-sm font-semibold tabular-nums ${tone.text}`}
                    >
                      {item.percent}%
                    </div>
                  </a>
                );
              })}
            </div>

            <PanelSectionTitle>Missing-link queries</PanelSectionTitle>
            <div
              className="mb-8 overflow-hidden rounded-md border border-border-subtle bg-surface-card"
              data-testid="coverage-queues"
            >
              {(summary.data?.action_queues ?? []).map((queue) => {
                const tone = SEVERITY_TONE[queue.severity];
                const href = hopHref(hopRoute(queue.id), queue.id, managedSystem);
                return (
                  <a
                    key={queue.id}
                    {...(href !== undefined ? { href } : {})}
                    data-testid={`coverage-queue-row-${queue.id}`}
                    className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0 hover:bg-surface-row-hover"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone.chip}`}
                    >
                      {tone.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {HOME_QUEUE_COPY[queue.id].title}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {HOME_QUEUE_COPY[queue.id].detail}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-lg font-semibold tabular-nums ${tone.text}`}>
                        {queue.count}
                      </div>
                      <div className="text-xs text-text-muted">records</div>
                    </div>
                  </a>
                );
              })}
            </div>

            <PanelSectionTitle>Coverage by Managed System</PanelSectionTitle>
            <div
              className="overflow-x-auto rounded-md border border-border-subtle bg-surface-card"
              data-testid="coverage-by-system"
            >
              <table
                className="w-full border-collapse text-left text-xs"
                data-testid="coverage-table"
              >
                <thead>
                  <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Managed System
                    </th>
                    {COVERAGE_COLUMNS.map((id) => (
                      <th
                        key={id}
                        scope="col"
                        data-testid={`coverage-col-${id}`}
                        className="px-3 py-2 text-right font-medium"
                      >
                        {COVERAGE_LABELS[id]}
                      </th>
                    ))}
                    {QUEUE_COLUMNS.map((id) => (
                      <th
                        key={id}
                        scope="col"
                        data-testid={`coverage-queue-col-${id}`}
                        className="px-3 py-2 text-right font-medium"
                      >
                        {HOME_QUEUE_COPY[id].sidebarLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(summary.data?.by_managed_system ?? []).flatMap((row) => {
                    const systemRow = (
                      <tr
                        key={row.managed_system_id}
                        data-testid={`coverage-system-row-${row.managed_system_id}`}
                        className="border-b border-border-subtle last:border-b-0"
                      >
                        <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                          {systemName(row.managed_system_id)}
                        </td>
                        {COVERAGE_COLUMNS.map((id) => (
                          <td
                            key={id}
                            data-testid={`coverage-cell-${row.managed_system_id}-${id}`}
                            className="px-3 py-2.5 text-right tabular-nums text-text-secondary"
                          >
                            {coverageCellText(row.coverage?.[id])}
                          </td>
                        ))}
                        {QUEUE_COLUMNS.map((id) => (
                          <td
                            key={id}
                            data-testid={`coverage-queue-cell-${row.managed_system_id}-${id}`}
                            className="px-3 py-2.5 text-right tabular-nums text-text-secondary"
                          >
                            {queueCellText(row.action_queues?.[id])}
                          </td>
                        ))}
                      </tr>
                    );
                    const areaRows = (row.analytics_areas ?? []).map(
                      (area: ManagedSystemCoverageArea) => (
                        <tr
                          key={area.analytics_area_id}
                          data-testid={`coverage-area-row-${area.analytics_area_id}`}
                          className="border-b border-border-subtle bg-surface-canvas/60 text-text-muted last:border-b-0"
                        >
                          <td
                            data-testid={`coverage-area-name-${area.analytics_area_id}`}
                            className="pl-8 pr-3 py-2 text-sm text-text-secondary"
                          >
                            ↳{' '}
                            {areasById[area.analytics_area_id] ??
                              area.analytics_area_id.slice(0, 8)}
                          </td>
                          {COVERAGE_COLUMNS.map((id) => (
                            <td
                              key={id}
                              data-testid={`coverage-cell-${area.analytics_area_id}-${id}`}
                              className="px-3 py-2 text-right tabular-nums"
                            >
                              {coverageCellText(
                                area.coverage?.[id as 'voc-task' | 'high-followup'],
                              )}
                            </td>
                          ))}
                          {QUEUE_COLUMNS.map((id) => (
                            <td
                              key={id}
                              data-testid={`coverage-queue-cell-${area.analytics_area_id}-${id}`}
                              className="px-3 py-2 text-right tabular-nums"
                            >
                              {queueCellText(
                                area.action_queues?.[
                                  id as 'unassigned-voc' | 'high-severity-unlinked'
                                ],
                              )}
                            </td>
                          ))}
                        </tr>
                      ),
                    );
                    return [systemRow, ...areaRows];
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
