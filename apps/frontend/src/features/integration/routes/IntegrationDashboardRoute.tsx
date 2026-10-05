import { ApiError, fetchDashboardSummary, fetchManagedSystems } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
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
import { Layers, Link2, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { ListStateMessage } from '@/components/ListStateMessage';
import { INTEGRATION_AVERAGE_COVERAGE_LABEL } from '@/lib/copy/coverage';
import { GLOSSARY } from '@/lib/copy/glossary';
import {
  INTEGRATION_DASHBOARD_QUEUE_ORDER,
  IntegrationDashboardQueueCard,
  IntegrationJumpCard,
} from '../components/IntegrationDashboardCards';

interface IntegrationDashboardSearch {
  managedSystem?: string;
}

const SUMMARY_ERROR_TITLE = '연동 요약을 불러오지 못했습니다.';

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}

export function IntegrationDashboardRoute(): React.ReactElement {
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
  const systems = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

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

  const coveragePercent = React.useMemo(() => {
    if (summary.isError) return undefined;
    const coverage = summary.data?.coverage;
    if (coverage === undefined || coverage.length === 0) return undefined;
    const average = coverage.reduce((total, metric) => total + metric.percent, 0) / coverage.length;
    return `${Math.round(average)}%`;
  }, [summary.data?.coverage, summary.isError]);

  const allQueuesPresent =
    summary.isSuccess && queues.length === INTEGRATION_DASHBOARD_QUEUE_ORDER.length;
  const gapCount = allQueuesPresent
    ? queues.reduce((total, queue) => total + queue.count, 0)
    : undefined;

  return (
    <PageShell contentClassName="max-w-none">
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

        <div className="mb-9">
          <div className="mb-3.5 flex items-center justify-between">
            <PanelSectionTitle className="mb-0">복구 · 후속 조치 큐</PanelSectionTitle>
            {gapCount !== undefined && (
              <span className="text-xs text-text-muted">
                <span data-testid="integration-dashboard-gap-count">{gapCount}</span>건
              </span>
            )}
          </div>
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
            isPermissionError(summary.error) ? (
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
          ) : (
            <div
              className="grid grid-cols-1 gap-3 xl:grid-cols-3"
              data-testid="integration-dashboard-queues"
            >
              {queues.map((queue) => (
                <IntegrationDashboardQueueCard key={queue.id} queue={queue} />
              ))}
            </div>
          )}
        </div>

        <div className="mb-9" data-testid="integration-surfaces">
          <PanelSectionTitle>연동 화면</PanelSectionTitle>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <IntegrationJumpCard
              href={`/integration/coverage${surfaceScopeSearch}`}
              title={GLOSSARY.coverage}
              description="VOC→Task · Finding→실행 · Milestone→성과 같이 워크플로 단절을 임계값으로 추적합니다."
              icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
              testId="integration-surface-coverage"
              {...(coveragePercent !== undefined
                ? { stat: coveragePercent, statLabel: INTEGRATION_AVERAGE_COVERAGE_LABEL }
                : {})}
            />
            <IntegrationJumpCard
              href={`/integration/links${surfaceScopeSearch}`}
              title={GLOSSARY.entityLinks}
              description="VOC·Finding·Task·Survey 사이의 연결 상태(활성·오래됨·분리됨)를 점검합니다."
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
            const coveragePercent = row.kpis?.coverage_percent;
            const coverageTone =
              coveragePercent === undefined
                ? undefined
                : coveragePercent > 65
                  ? COVERAGE_TONE.good
                  : coveragePercent > 45
                    ? COVERAGE_TONE.warn
                    : COVERAGE_TONE.bad;
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
                  {coveragePercent === undefined || coverageTone === undefined ? (
                    <span className="text-text-secondary">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-2">
                      <ProgressMeter
                        clip
                        element="span"
                        value={coveragePercent}
                        semantics={{ role: 'meter', label: GLOSSARY.coverage }}
                        tone={coverageTone.meter}
                        className="inline-block w-14 align-middle"
                        trackTone="row-hover"
                      />
                      <span className={`min-w-8 tabular-nums ${coverageTone.text}`}>
                        {coveragePercent}%
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
