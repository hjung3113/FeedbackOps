import { fetchDashboardSummary, isPermissionDenied } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { useMe } from '@/lib/auth/useMe';
import { AREA_REPORT_COPY } from '@/lib/copy/area-report';
import type { DashboardSummary } from '@fops/shared';
import {
  Button,
  PageShell,
  PanelSectionTitle,
  PermissionBlockedPanel,
  ProgressMeter,
  Skeleton,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { FileText, Layers, Link2, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { RecoveryFreshness } from '../recovery/RecoveryFreshness';
import type { RenderRecoveryAccess } from '../recovery/RecoveryPanel';
import { useRecoveryQueue } from '../recovery/useRecoveryQueue';

import { ListStateMessage } from '@/components/ListStateMessage';
import { COVERAGE_NO_DATA_LABEL, INTEGRATION_AVERAGE_COVERAGE_LABEL } from '@/lib/copy/coverage';
import { EVIDENCE_COPY } from '@/lib/copy/evidence';
import { GLOSSARY } from '@/lib/copy/glossary';
import { HOME_COPY, HOME_QUEUE_COPY } from '@/lib/copy/home';
import { managedSystemsCatalogQuery } from '@/lib/cross-system/useManagedSystemNames';
import { InternalLink } from '@/lib/router/InternalLink';
import { hrefWithManagedSystem } from '@/lib/router/managed-system-href';
import {
  INTEGRATION_DASHBOARD_QUEUE_ORDER,
  IntegrationDashboardQueueCard,
  IntegrationJumpCard,
} from '../components/IntegrationDashboardCards';

interface IntegrationDashboardSearch {
  managedSystem?: string;
}

const SUMMARY_ERROR_TITLE = '연동 요약을 불러오지 못했습니다.';

export function IntegrationDashboardRoute({
  renderRequestAccess,
}: { renderRequestAccess?: RenderRecoveryAccess } = {}): React.ReactElement {
  const recovery = useRecoveryQueue('operational', true, renderRequestAccess);
  const me = useMe();
  const search = useSearch({ strict: false }) as IntegrationDashboardSearch;
  const managedSystem = search.managedSystem;
  const managedSystemId =
    managedSystem !== undefined && managedSystem !== 'all' ? managedSystem : undefined;
  const surfaceScopeSearch =
    managedSystem === undefined ? '' : `?managedSystem=${encodeURIComponent(managedSystem)}`;

  const summary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    queryFn: ({ signal }) =>
      fetchDashboardSummary({
        signal,
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      }),
    retry: false,
  });
  const systems = useQuery({ ...managedSystemsCatalogQuery(), retry: false });

  const queues = React.useMemo(() => {
    const byId = new Map<
      DashboardSummary['action_queues'][number]['id'],
      DashboardSummary['action_queues'][number]
    >((summary.data?.action_queues ?? []).map((queue) => [queue.id, queue] as const));
    return INTEGRATION_DASHBOARD_QUEUE_ORDER.flatMap((id) => {
      const queue = byId.get(id);
      return queue === undefined ? [] : [queue];
    });
  }, [summary.data?.action_queues]);
  const activeQueues = React.useMemo(() => queues.filter((queue) => queue.count > 0), [queues]);
  const zeroQueues = React.useMemo(() => queues.filter((queue) => queue.count === 0), [queues]);

  const coveragePercent = React.useMemo(() => {
    if (summary.isError) return undefined;
    const coverage = summary.data?.coverage;
    if (coverage === undefined || coverage.length === 0) return undefined;
    // Total-zero metrics are absence of work (no_data), not 0% performance;
    // the average only covers measured metrics (ADR-0067 56-1/O2).
    const measured = coverage.filter((metric) => metric.status !== 'no_data');
    if (measured.length === 0) return undefined;
    const average = measured.reduce((total, metric) => total + metric.percent, 0) / measured.length;
    return `${Math.round(average)}%`;
  }, [summary.data?.coverage, summary.isError]);

  // #1087 UX: when every metric in scope lacks a denominator the card still
  // explains itself — 평균 커버리지 · 집계 대상 없음, muted; the error path
  // keeps the plain omission.
  const coverageNoData = React.useMemo(() => {
    if (summary.isError) return false;
    const coverage = summary.data?.coverage;
    return (
      coverage !== undefined &&
      coverage.length > 0 &&
      coverage.every((metric) => metric.status === 'no_data')
    );
  }, [summary.data?.coverage, summary.isError]);

  const allQueuesPresent =
    summary.isSuccess &&
    (queues.length === INTEGRATION_DASHBOARD_QUEUE_ORDER.length ||
      (me.data?.actor.role_level === 'developer' && queues.length > 0));
  const gapCount = allQueuesPresent
    ? queues.reduce((total, queue) => total + queue.count, 0)
    : undefined;

  return (
    <PageShell contentClassName="max-w-none" detailPanel={recovery.detailPanel}>
      <section data-testid="integration-dashboard">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              연동 액션 대시보드
            </h1>
            <p className="mt-3 text-sm text-text-muted">
              VOC · Finding · Task · Survey 사이의 흐름이 끊긴 지점을 추적합니다. 차트가 아니라 다음
              행동이 우선합니다.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void summary.refetch()}
              disabled={summary.isFetching}
              data-testid="integration-dashboard-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {GLOSSARY.refresh}
            </Button>
          </div>
        </header>
        <RecoveryFreshness
          computedAt={summary.data?.computed_at}
          failed={summary.isError}
          updatedAt={summary.dataUpdatedAt}
        />

        <div className="mb-9">
          {activeQueues.length > 0 && (
            <div className="mb-3.5 flex items-center justify-between">
              <PanelSectionTitle className="mb-0">복구 · 후속 조치 큐</PanelSectionTitle>
              {gapCount !== undefined && (
                <span className="text-xs text-text-muted">
                  <span data-testid="integration-dashboard-gap-count">{gapCount}</span>건
                </span>
              )}
            </div>
          )}
          {summary.isPending ? (
            <div
              className="grid grid-cols-1 gap-3 xl:grid-cols-3"
              data-testid="integration-dashboard-queues-loading"
            >
              {INTEGRATION_DASHBOARD_QUEUE_ORDER.map((id) => (
                <Skeleton key={id} className="h-52" />
              ))}
            </div>
          ) : summary.isError ? (
            isPermissionDenied(summary.error) ? (
              <div data-testid="integration-dashboard-blocked">
                <PermissionBlockedPanel state="denied" category="연동 요약" />
              </div>
            ) : (
              <div data-testid="integration-dashboard-summary-error">
                <ListStateMessage
                  variant="error"
                  title={SUMMARY_ERROR_TITLE}
                  body={mapUnknownError(summary.error).message}
                  action={{ label: '다시 시도', onClick: () => void summary.refetch() }}
                />
              </div>
            )
          ) : queues.length === 0 ? (
            <ListStateMessage
              variant="empty"
              title="이 범위에서 표시할 큐가 없습니다."
              body="역할과 Managed System 범위에서 반환된 큐 데이터만 표시됩니다."
            />
          ) : activeQueues.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-3 xl:grid-cols-3"
              data-testid="integration-dashboard-queues"
            >
              {activeQueues.map((queue) => (
                <IntegrationDashboardQueueCard
                  key={queue.id}
                  queue={queue}
                  {...(managedSystemId !== undefined ? { managedSystemId } : {})}
                />
              ))}
            </div>
          ) : null}
          {summary.isSuccess && zeroQueues.length > 0 && (
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              data-testid="integration-zero-queues"
            >
              <span className="text-xs text-text-muted">{HOME_COPY.noZeroQueueItems}</span>
              {zeroQueues.map((queue) => (
                <InternalLink
                  className="inline-flex items-center rounded-full border border-border-subtle bg-surface-card px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                  data-testid={`integration-zero-queue-${queue.id}`}
                  href={hrefWithManagedSystem(queue.next_action.route, managedSystemId)}
                  key={queue.id}
                >
                  {HOME_QUEUE_COPY[queue.id].title} 0
                </InternalLink>
              ))}
            </div>
          )}
        </div>

        <div className="mb-9" data-testid="integration-surfaces">
          <PanelSectionTitle>연동 화면</PanelSectionTitle>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <IntegrationJumpCard
              href={`/integration/evidence${surfaceScopeSearch}`}
              title={EVIDENCE_COPY.title}
              icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
              testId="integration-surface-evidence"
            />
            <IntegrationJumpCard
              href={`/integration/coverage${surfaceScopeSearch}`}
              title={GLOSSARY.coverage}
              icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
              testId="integration-surface-coverage"
              secondaryLink={{
                href: `/integration/coverage?view=areas${surfaceScopeSearch.replace('?', '&')}`,
                label: AREA_REPORT_COPY.secondary,
              }}
              {...(coverageNoData
                ? {
                    stat: `${INTEGRATION_AVERAGE_COVERAGE_LABEL} · ${COVERAGE_NO_DATA_LABEL}`,
                    statMuted: true,
                  }
                : coveragePercent !== undefined
                  ? { stat: coveragePercent, statLabel: INTEGRATION_AVERAGE_COVERAGE_LABEL }
                  : {})}
            />
            <IntegrationJumpCard
              href={`/integration/links${surfaceScopeSearch}`}
              title={GLOSSARY.entityLinks}
              icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
              testId="integration-surface-links"
            />
          </div>
        </div>

        {!summary.isError && (
          <div data-testid="integration-managed-system-overview">
            <PanelSectionTitle>Managed System 개요</PanelSectionTitle>
            {summary.isPending || systems.isPending ? (
              <Skeleton className="h-48" />
            ) : summary.data === undefined || summary.data.by_managed_system.length === 0 ? (
              <ListStateMessage
                variant="empty"
                title="이 범위에서 표시할 Managed System 요약이 없습니다."
                body="요약이 표시 가능한 항목을 반환할 때 Managed System 행이 나타납니다."
              />
            ) : (
              <ManagedSystemOverview
                rows={summary.data.by_managed_system}
                systems={systems.data?.items ?? []}
              />
            )}
          </div>
        )}
        {recovery.queue}
      </section>
    </PageShell>
  );
}

type ManagedSystemRow = DashboardSummary['by_managed_system'][number];

const COVERAGE_TONE = {
  good: { text: 'text-accent-success', meter: 'success' },
  warn: { text: 'text-accent-warn', meter: 'warning' },
  bad: { text: 'text-accent-danger', meter: 'danger' },
} as const;

function ManagedSystemOverview({
  rows,
  systems,
}: {
  rows: ManagedSystemRow[];
  systems: Array<{ id: string; name: string }>;
}): React.ReactElement {
  const systemNameById = new Map(systems.map((system) => [system.id, system.name]));
  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle bg-surface-card">
      <table
        className="w-full min-w-[760px] border-collapse text-left text-xs"
        data-testid="integration-managed-system-table"
      >
        <thead>
          <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-4 py-2 font-medium">
              Managed System
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              미해결 VOC
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Findings
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tasks
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              미배정
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              커버리지
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const openVoc = row.kpis?.open_voc;
            const activeFinding = row.kpis?.active_finding;
            const tasksInFlight = row.kpis?.tasks_in_flight;
            const unassigned = row.action_queues?.['unassigned-voc'];
            // Consistent Coverage states: tone comes from the server's band
            // status, not local thresholds; total zero is neutral no_data.
            const coverageCell = row.coverage?.['voc-task'];
            const name =
              systemNameById.get(row.managed_system_id) ?? row.managed_system_id.slice(0, 8);
            return (
              <tr
                key={row.managed_system_id}
                className="border-b border-border-subtle last:border-b-0"
                data-testid={`integration-managed-system-row-${row.managed_system_id}`}
              >
                <th scope="row" className="px-4 py-2.5 text-sm font-medium text-text-primary">
                  {name}
                </th>
                <td
                  className="px-3 py-2.5 text-right tabular-nums text-text-secondary"
                  data-testid={`integration-managed-system-open-voc-${row.managed_system_id}`}
                >
                  {openVoc === undefined ? '—' : openVoc}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums text-text-secondary"
                  data-testid={`integration-managed-system-findings-${row.managed_system_id}`}
                >
                  {activeFinding === undefined ? '—' : activeFinding}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums text-text-secondary"
                  data-testid={`integration-managed-system-tasks-${row.managed_system_id}`}
                >
                  {tasksInFlight === undefined ? '—' : tasksInFlight}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    unassigned !== undefined && unassigned > 3
                      ? 'text-accent-danger'
                      : 'text-text-secondary'
                  }`}
                  data-testid={`integration-managed-system-unassigned-${row.managed_system_id}`}
                >
                  {unassigned === undefined ? '—' : unassigned}
                </td>
                <td
                  className="px-3 py-2.5 text-right"
                  data-testid={`integration-managed-system-coverage-${row.managed_system_id}`}
                >
                  {coverageCell === undefined ? (
                    <span className="text-text-secondary">—</span>
                  ) : coverageCell.status === 'no_data' ? (
                    <span className="text-text-muted">{COVERAGE_NO_DATA_LABEL}</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-2">
                      <ProgressMeter
                        clip
                        element="span"
                        value={coverageCell.percent}
                        semantics={{ role: 'meter', label: GLOSSARY.coverage }}
                        tone={COVERAGE_TONE[coverageCell.status].meter}
                        className="inline-block w-14 align-middle"
                        trackTone="row-hover"
                      />
                      <span
                        className={`min-w-8 tabular-nums ${COVERAGE_TONE[coverageCell.status].text}`}
                      >
                        {coverageCell.percent}%
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
