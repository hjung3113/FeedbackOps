import type { DashboardSummary, TaskDto, TaskRequestDto } from '@fops/shared';
import { Button, PageShell } from '@fops/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { fetchDashboardSummary, fetchTaskRequests, listTasks } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import { HOME_COVERAGE_COPY, HOME_COPY, HOME_KPI_COPY, HOME_QUEUE_COPY, homeSeverityLabel } from '@/lib/copy/home';

export function HomeScreen({ managedSystemId }: { managedSystemId?: string }): React.ReactElement {
  const me = useMe();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ['dashboard-summary', managedSystemId] as const,
    queryFn: ({ signal }) => fetchDashboardSummary({ signal, ...(managedSystemId !== undefined ? { managedSystemId } : {}) }),
    retry: false,
  });
  const myTasks = useQuery({
    queryKey: ['home-my-tasks', me.data?.actor.id] as const,
    enabled: me.data?.actor.id !== undefined,
    queryFn: ({ signal }) => listTasks({ ...(me.data?.actor.id !== undefined ? { assignee: me.data.actor.id } : {}), signal }),
    retry: false,
  });
  const pendingRequests = useQuery({
    queryKey: ['home-pending-task-requests'] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ status: 'pending_review', signal }),
    retry: false,
  });
  const actorName = me.data?.actor.display_name ?? '지원';
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: ['dashboard-summary', managedSystemId] }); };

  return (
    <PageShell contentClassName="max-w-none">
      <section data-testid="home-screen">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{HOME_COPY.title(actorName)}</h1>
            <p className="mt-3 text-sm text-text-muted">{HOME_COPY.subtitle(summary.data?.action_queues)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="subtle" size="sm" onClick={refresh} data-testid="home-refresh"><RefreshCw className="h-3.5 w-3.5" />{HOME_COPY.refresh}</Button>
            <Button asChild variant="primary" size="sm"><a href="/vocs?action=create"><Plus className="h-3.5 w-3.5" />{HOME_COPY.newVoc}</a></Button>
          </div>
        </header>
        {summary.isError ? <p className="mb-5 text-sm text-accent-danger">Home summary unavailable.</p> : <HomeSummary summary={summary.data} />}
        <div className="mt-9 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-7">
          <MyWorkPanel tasks={myTasks.data?.items ?? []} requests={pendingRequests.data?.items ?? []} />
          <CoveragePanel coverage={summary.data?.coverage ?? []} />
        </div>
      </section>
    </PageShell>
  );
}

function HomeSummary({ summary }: { summary: DashboardSummary | undefined }): React.ReactElement {
  const kpis = summary?.kpis;
  const kpiKeys = Object.keys(HOME_KPI_COPY) as Array<keyof typeof HOME_KPI_COPY>;
  return <>
    <div className="mb-8 flex flex-wrap gap-2" data-testid="home-kpis">
      {kpis && kpiKeys.map((key) => {
        const value = kpis[key];
        if (value === undefined) return null;
        return <div key={key} className="rounded-full border border-border-subtle bg-surface-card px-2.5 py-1 text-xs text-text-secondary" data-testid={`home-kpi-${key}`}>
          <span>{HOME_KPI_COPY[key]}</span><span className={key === 'pending_request' ? 'ml-1.5 font-semibold tabular-nums text-accent-warn' : 'ml-1.5 font-semibold tabular-nums text-text-primary'}>{key === 'coverage_percent' ? `${value}%` : value}</span>
        </div>;
      })}
    </div>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{HOME_COPY.queueHeading}</h2></div>
    <div className="grid grid-cols-4 gap-3" data-testid="home-action-queues">
      {summary?.action_queues.map((queue) => <ActionQueueCard key={queue.id} queue={queue} />)}
    </div>
  </>;
}

function ActionQueueCard({ queue }: { queue: DashboardSummary['action_queues'][number] }): React.ReactElement {
  const copy = HOME_QUEUE_COPY[queue.id];
  const countClass = queue.severity === 'urgent' ? 'text-accent-danger' : queue.severity === 'warn' ? 'text-accent-warn' : 'text-accent-info';
  const chipClass = queue.severity === 'urgent' ? 'bg-accent-danger/10 text-accent-danger' : queue.severity === 'warn' ? 'bg-accent-warn/10 text-accent-warn' : 'bg-accent-info/10 text-accent-info';
  return <article className="flex min-h-[252px] flex-col rounded-md border border-border-subtle bg-surface-card p-4" data-testid={`home-queue-${queue.id}`}>
    <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-text-primary">{copy.title}</h3><p className="mt-2 text-xs leading-5 text-text-muted">{copy.detail}</p></div><span className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide ${chipClass}`}>{homeSeverityLabel(queue.severity)}</span></div>
    <div className={`mt-auto pt-5 text-4xl font-semibold tabular-nums ${countClass}`} data-testid={`home-queue-count-${queue.id}`}>{queue.count}</div>
    <footer className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
      {queue.secondary_action && copy.secondaryAction ? <a className="text-xs text-text-secondary hover:text-text-primary" href={queue.secondary_action.route}>{copy.secondaryAction}</a> : <span />}
      <Button asChild variant="primary" size="sm"><a href={queue.next_action.route}>{copy.primaryAction}<ArrowRight className="h-3.5 w-3.5" /></a></Button>
    </footer>
  </article>;
}

function MyWorkPanel({ tasks, requests }: { tasks: TaskDto[]; requests: TaskRequestDto[] }): React.ReactElement {
  const rows = [
    ...tasks.map((task) => ({ id: task.id, label: `${task.display_id} — ${task.title}`, meta: task.status, href: `/tasks?view=board&param=${task.id}` })),
    ...requests.map((request) => ({ id: request.id, label: `${request.display_id} — ${request.requested_outcome}`, meta: request.status, href: `/tasks?view=requests&param=${request.id}` })),
  ].slice(0, 4);
  return <section><PanelHeading title={HOME_COPY.myWork} action={HOME_COPY.openMyWork} disabled />
    <div className="overflow-hidden rounded-md border border-border-subtle bg-surface-card" data-testid="home-my-work">
      {rows.map((row) => <a key={row.id} href={row.href} className="flex min-h-row-default items-center gap-3 border-b border-border-subtle px-4 last:border-b-0 hover:bg-surface-row-hover"><span className="h-4 w-[3px] rounded-pill bg-accent-warn" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{row.label}</span><span className="block truncate text-xs text-text-muted">{row.meta}</span></span><ChevronRight className="h-4 w-4 text-text-muted" /></a>)}
      {rows.length === 0 && <p className="px-4 py-5 text-sm text-text-muted">No work is currently assigned to you.</p>}
    </div>
  </section>;
}

function CoveragePanel({ coverage }: { coverage: DashboardSummary['coverage'] }): React.ReactElement {
  return <section><PanelHeading title={HOME_COPY.coverage} action={HOME_COPY.viewCoverage} href="/integration" />
    <div className="space-y-4 rounded-md border border-border-subtle bg-surface-card p-4" data-testid="home-coverage">
      {coverage.map((item) => <div key={item.id}><div className="flex justify-between gap-2 text-xs"><span className="text-text-primary">{HOME_COVERAGE_COPY[item.id]}</span><span className="shrink-0 tabular-nums text-text-muted">{item.value} / {item.total} · {item.percent}%</span></div><div className="mt-2 h-1 rounded-full bg-surface-row-selected"><div className={item.status === 'bad' ? 'h-1 rounded-full bg-accent-danger' : item.status === 'warn' ? 'h-1 rounded-full bg-accent-warn' : 'h-1 rounded-full bg-accent-success'} style={{ width: `${item.percent}%` }} /></div></div>)}
    </div>
  </section>;
}

function PanelHeading({ title, action, href, disabled = false }: { title: string; action: string; href?: string; disabled?: boolean }): React.ReactElement {
  return <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h2>{disabled ? <span className="text-xs text-text-secondary">{action} <ArrowRight className="inline h-3 w-3" /></span> : <a href={href} className="text-xs text-text-secondary hover:text-text-primary">{action} <ArrowRight className="inline h-3 w-3" /></a>}</div>;
}
