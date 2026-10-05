import {
  DASHBOARD_HOP_ROUTES,
  type DashboardSummary,
  type TaskDto,
  type TaskRequestDto,
} from '@fops/shared';
import {
  Button,
  PageShell,
  ProgressMeter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import type * as React from 'react';

import {
  type MinePermissionRequestRow,
  fetchDashboardSummary,
  fetchPermissionRequestsMine,
  fetchTaskRequests,
  listTasks,
} from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { COVERAGE_METRIC_LABELS } from '@/lib/copy/coverage';
import { TASK_REQUEST_STATUS_LABELS, TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import {
  HOME_COPY,
  HOME_INBOX_COPY,
  HOME_KPI_COPY,
  HOME_QUEUE_COPY,
  homeSeverityLabel,
} from '@/lib/copy/home';
import { permissionRequestsMineKey } from '@/lib/cross-system/usePermissionCheck';
import {
  formatUnreadBadge,
  useUnreadNotificationCount,
} from '@/lib/cross-system/useUnreadNotificationCount';
import { formatRelativeTime } from '@/lib/format/datetime';
import { AnswerableSurveysPanel } from './AnswerableSurveysPanel';
import { InboxPanel } from './InboxPanel';

export const HOME_COVERAGE_HREF = '/integration/coverage';

const MY_PERMISSION_REQUEST_STATUS_LABELS: Record<MinePermissionRequestRow['status'], string> = {
  pending: '대기 중',
  needs_more_info: '추가 정보 필요',
};

export type HomeTab = 'dashboard' | 'inbox';

export function HomeScreen({
  managedSystemId,
  activeTab = 'dashboard',
  onTabChange,
}: {
  managedSystemId?: string;
  activeTab?: HomeTab;
  onTabChange?: (tab: HomeTab) => void;
}): React.ReactElement {
  const me = useMe();
  const queryClient = useQueryClient();
  const unreadNotifications = useUnreadNotificationCount();
  const unreadCount = unreadNotifications.data;
  const unreadBadge =
    unreadCount !== undefined && unreadCount > 0 ? formatUnreadBadge(unreadCount) : undefined;
  const summary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    queryFn: ({ signal }) =>
      fetchDashboardSummary({
        signal,
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      }),
    retry: false,
  });
  const myTasks = useQuery({
    queryKey: ['home-my-tasks', me.data?.actor.id] as const,
    enabled: me.data?.actor.id !== undefined,
    queryFn: ({ signal }) =>
      listTasks({
        ...(me.data?.actor.id !== undefined ? { assignee: me.data.actor.id } : {}),
        signal,
      }),
    retry: false,
  });
  const pendingRequests = useQuery({
    queryKey: ['home-pending-task-requests'] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ status: 'pending_review', signal }),
    retry: false,
  });
  const openPermissionRequests = useQuery({
    queryKey: permissionRequestsMineKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine(signal),
    retry: false,
  });
  const actorName = me.data?.actor.display_name ?? '지원';
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard-summary', managedSystemId] });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === 'dashboard' || value === 'inbox') onTabChange?.(value);
      }}
    >
      <PageShell contentClassName="max-w-none">
        <section data-testid="home-screen">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                {HOME_COPY.title(actorName)}
              </h1>
              <p className="mt-3 text-sm text-text-muted">
                {HOME_COPY.subtitle(summary.data?.action_queues, summary.data?.coverage)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="subtle" size="sm" onClick={refresh} data-testid="home-refresh">
                <RefreshCw className="h-3.5 w-3.5" />
                {HOME_COPY.refresh}
              </Button>
              <Button asChild variant="primary" size="sm">
                <a href="/vocs?action=create">
                  <Plus className="h-3.5 w-3.5" />
                  {HOME_COPY.newVoc}
                </a>
              </Button>
            </div>
          </header>
          <TabsList aria-label={HOME_INBOX_COPY.tabListLabel} className="mb-4">
            <TabsTrigger value="dashboard">{HOME_INBOX_COPY.tabs.dashboard}</TabsTrigger>
            {/* oxlint-disable-next-line shadcn/no-restyle -- the Inbox tab keeps an 8px gap before its unread-count badge */}
            <TabsTrigger value="inbox" className="gap-2">
              {HOME_INBOX_COPY.tabs.inbox}
              {unreadBadge !== undefined && (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-caption font-semibold leading-4 text-white">
                  {unreadBadge}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-0">
            {summary.isError ? (
              <p className="mb-5 text-sm text-accent-danger">홈 요약을 불러올 수 없습니다.</p>
            ) : (
              <HomeSummary summary={summary.data} />
            )}
            <div
              className={`mt-9 grid gap-7 ${
                summary.data !== undefined && summary.data.coverage.length > 0
                  ? 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'
                  : 'grid-cols-1'
              }`}
            >
              <MyWorkPanel
                tasks={myTasks.data?.items ?? []}
                requests={pendingRequests.data?.items ?? []}
              />
              {summary.data !== undefined && summary.data.coverage.length > 0 && (
                <CoveragePanel
                  coverage={summary.data.coverage}
                  {...(managedSystemId !== undefined ? { managedSystemId } : {})}
                />
              )}
            </div>
            <div className="mt-9">
              <OpenRequestsPanel requests={openPermissionRequests.data?.requests ?? []} />
            </div>
            <div className="mt-9">
              <AnswerableSurveysPanel />
            </div>
          </TabsContent>
          <TabsContent value="inbox" className="mt-0">
            <InboxPanel />
          </TabsContent>
        </section>
      </PageShell>
    </Tabs>
  );
}

function OpenRequestsPanel({
  requests,
}: { requests: MinePermissionRequestRow[] }): React.ReactElement {
  return (
    <section>
      <PanelHeading title={HOME_COPY.openRequests} />
      {requests.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-card">
          <p className="px-4 py-5 text-sm text-text-muted">{HOME_COPY.noOpenRequests}</p>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
          data-testid="home-open-requests-list"
        >
          {requests.map((request) => (
            <li
              key={request.id}
              className="border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <p className="text-sm font-medium text-text-primary">
                {getCapabilityDisplayLabel(request.requested_capability)}
              </p>
              <p className="text-xs text-text-muted">
                {MY_PERMISSION_REQUEST_STATUS_LABELS[request.status]} ·{' '}
                {formatRelativeTime(request.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeSummary({ summary }: { summary: DashboardSummary | undefined }): React.ReactElement {
  const kpis = summary?.kpis;
  const queues = summary?.action_queues ?? [];
  const activeQueues = queues.filter((queue) => queue.count > 0);
  const zeroQueues = queues.filter((queue) => queue.count === 0);
  const kpiKeys = Object.keys(HOME_KPI_COPY) as Array<keyof typeof HOME_KPI_COPY>;
  return (
    <>
      <div className="mb-8 flex flex-wrap gap-2" data-testid="home-kpis">
        {kpis &&
          kpiKeys.map((key) => {
            const value = kpis[key];
            if (value === undefined) return null;
            return (
              <div
                key={key}
                className="rounded-full border border-border-subtle bg-surface-card px-2.5 py-1 text-xs text-text-secondary"
                data-testid={`home-kpi-${key}`}
              >
                <span>{HOME_KPI_COPY[key]}</span>
                <span
                  className={
                    key === 'pending_request'
                      ? 'ml-1.5 font-semibold tabular-nums text-accent-warn'
                      : 'ml-1.5 font-semibold tabular-nums text-text-primary'
                  }
                >
                  {key === 'coverage_percent' ? `${value}%` : value}
                </span>
              </div>
            );
          })}
      </div>
      {/* #521 follows empty-state AC over the populated docs/design-prototype/screen-home.jsx example. */}
      {summary !== undefined && activeQueues.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {HOME_COPY.queueHeading}
            </h2>
          </div>
          <div className="flex flex-col gap-2" data-testid="home-action-queues">
            {activeQueues.map((queue) => (
              <ActionQueueRow key={queue.id} queue={queue} />
            ))}
          </div>
        </>
      )}
      {zeroQueues.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="home-zero-queues">
          <span className="text-xs text-text-muted">{HOME_COPY.noZeroQueueItems}</span>
          {zeroQueues.map((queue) => (
            <a
              className="inline-flex items-center rounded-full border border-border-subtle bg-surface-card px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              data-testid={`home-zero-queue-${queue.id}`}
              href={queue.next_action.route}
              key={queue.id}
            >
              {HOME_QUEUE_COPY[queue.id].title} 0
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function ActionQueueRow({
  queue,
}: { queue: DashboardSummary['action_queues'][number] }): React.ReactElement {
  const copy = HOME_QUEUE_COPY[queue.id];
  const countClass =
    queue.severity === 'urgent'
      ? 'text-accent-danger'
      : queue.severity === 'warn'
        ? 'text-accent-warn'
        : 'text-accent-info';
  const chipClass =
    queue.severity === 'urgent'
      ? 'bg-accent-danger/10 text-accent-danger'
      : queue.severity === 'warn'
        ? 'bg-accent-warn/10 text-accent-warn'
        : 'bg-accent-info/10 text-accent-info';
  return (
    <article
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2"
      data-testid={`home-queue-${queue.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`shrink-0 text-2xl font-semibold tabular-nums ${countClass}`}
          data-testid={`home-queue-count-${queue.id}`}
        >
          {queue.count}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">{copy.title}</h3>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide ${chipClass}`}
            >
              {homeSeverityLabel(queue.severity)}
            </span>
          </div>
          <p className="truncate text-xs leading-5 text-text-muted">{copy.detail}</p>
        </div>
      </div>
      <footer
        className={[
          'flex flex-wrap items-center justify-end gap-3',
          'max-sm:col-span-2 max-sm:justify-between',
        ].join(' ')}
      >
        {queue.secondary_action && copy.secondaryAction ? (
          <a
            className="text-xs text-text-secondary hover:text-text-primary"
            href={queue.secondary_action.route}
          >
            {copy.secondaryAction}
          </a>
        ) : (
          <span />
        )}
        <Button asChild variant="primary" size="sm" wrapText className="max-w-full">
          <a href={queue.next_action.route}>
            <span className="min-w-0 wrap-break-word">{copy.primaryAction}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </a>
        </Button>
      </footer>
    </article>
  );
}

function MyWorkPanel({
  tasks,
  requests,
}: { tasks: TaskDto[]; requests: TaskRequestDto[] }): React.ReactElement {
  const rows = [
    ...tasks.map((task) => ({
      id: task.id,
      label: `${task.display_id} — ${task.title}`,
      meta: TASK_STATUS_LABELS[task.status],
      href: `/tasks?view=board&param=${task.id}`,
    })),
    ...requests.map((request) => ({
      id: request.id,
      label: `${request.display_id} — ${request.requested_outcome}`,
      meta: TASK_REQUEST_STATUS_LABELS[request.status],
      href: `/tasks?view=requests&param=${request.id}`,
    })),
  ].slice(0, 4);
  return (
    <section>
      <PanelHeading title={HOME_COPY.assignedToYou} />
      <div
        className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
        data-testid="home-my-work"
      >
        {rows.map((row) => (
          <a
            key={row.id}
            href={row.href}
            className="flex min-h-row-default items-center gap-3 border-b border-border-subtle px-4 last:border-b-0 hover:bg-surface-row-hover"
          >
            <span className="h-4 w-row-accent rounded-pill bg-accent-warn" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text-primary">
                {row.label}
              </span>
              <span className="block truncate text-xs text-text-muted">{row.meta}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-text-muted" />
          </a>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-5 text-sm text-text-muted">현재 내게 배정된 작업이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function coverageHopHref(
  id: DashboardSummary['coverage'][number]['id'],
  managedSystemId: string | undefined,
): string | undefined {
  if (id === 'milestone-outcome') return undefined;
  const route = DASHBOARD_HOP_ROUTES[id];
  if (managedSystemId === undefined) return route;
  const url = new URL(route, 'http://localhost');
  url.searchParams.set('managedSystem', managedSystemId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function CoverageMetricRow({
  item,
  href,
}: { item: DashboardSummary['coverage'][number]; href: string | undefined }): React.ReactElement {
  const body = (
    <>
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-text-primary">{COVERAGE_METRIC_LABELS[item.id]}</span>
        <span className="shrink-0 tabular-nums text-text-muted">
          {item.value} / {item.total} · {item.percent}%
        </span>
      </div>
      <ProgressMeter
        value={item.percent}
        size="thin"
        tone={item.status === 'bad' ? 'danger' : item.status === 'warn' ? 'warning' : 'success'}
        className="mt-2 w-full"
        trackTone="row-selected"
      />
    </>
  );
  return href === undefined ? (
    <div data-testid={`home-coverage-row-${item.id}`}>{body}</div>
  ) : (
    <a href={href} className="block" data-testid={`home-coverage-row-${item.id}`}>
      {body}
    </a>
  );
}

function CoveragePanel({
  coverage,
  managedSystemId,
}: { coverage: DashboardSummary['coverage']; managedSystemId?: string }): React.ReactElement {
  return (
    <section>
      <PanelHeading
        title={HOME_COPY.coverage}
        action={HOME_COPY.viewCoverage}
        href={HOME_COVERAGE_HREF}
      />
      <div
        className="space-y-4 rounded-md border border-border-subtle bg-surface-card p-4"
        data-testid="home-coverage"
      >
        {coverage.map((item) => (
          <CoverageMetricRow
            key={item.id}
            item={item}
            href={coverageHopHref(item.id, managedSystemId)}
          />
        ))}
      </div>
    </section>
  );
}

function PanelHeading({
  title,
  action,
  href,
  disabled = false,
}: { title: string; action?: string; href?: string; disabled?: boolean }): React.ReactElement {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      {action !== undefined &&
        (disabled ? (
          <span className="text-xs text-text-secondary">
            {action} <ArrowRight className="inline h-3 w-3" />
          </span>
        ) : (
          <a href={href} className="text-xs text-text-secondary hover:text-text-primary">
            {action} <ArrowRight className="inline h-3 w-3" />
          </a>
        ))}
    </div>
  );
}
