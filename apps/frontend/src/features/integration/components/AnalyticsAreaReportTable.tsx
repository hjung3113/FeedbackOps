import { AREA_REPORT_COPY as COPY } from '@/lib/copy/area-report';
import { InternalLink } from '@/lib/router/InternalLink';
import type { AreaReportLink, DashboardAreaReport } from '@fops/shared';
import { formatRecoveryTime } from '../recovery/RecoveryFreshness';

type Row = DashboardAreaReport['items'][number];
type Count = NonNullable<Row['voc']>['total'];
type Ratio = NonNullable<Row['voc']>['task_link'];
const focus =
  'hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring';
function href(link: AreaReportLink) {
  return `${link.pathname}?${new URLSearchParams(link.search).toString()}`;
}
function Unavailable() {
  return (
    <span title={COPY.unavailable}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{COPY.unavailable}</span>
    </span>
  );
}
function CountLine({
  systemName,
  domain,
  area,
  label,
  metric,
}: { systemName: string; domain: string; area: string; label: string; metric: Count | undefined }) {
  if (!metric)
    return (
      <div>
        {label} <Unavailable />
      </div>
    );
  return (
    <div>
      {metric.count > 0 && metric.link ? (
        <InternalLink
          href={href(metric.link)}
          className={`text-accent-primary ${focus}`}
          aria-label={`${systemName} · ${area} ${domain} ${label} ${metric.count}건`}
        >
          {label} {metric.count}
        </InternalLink>
      ) : (
        <span>
          {label} {metric.count}
        </span>
      )}
    </div>
  );
}
function RatioLine({
  systemName,
  domain,
  area,
  label,
  metric,
}: { systemName: string; domain: string; area: string; label: string; metric: Ratio | undefined }) {
  if (!metric)
    return (
      <div className="text-xs text-text-muted">
        {label} <Unavailable />
      </div>
    );
  const text = `${label} ${metric.total === 0 ? COPY.notApplicable : `${metric.value}/${metric.total} · ${Math.round((metric.value / metric.total) * 100)}%`}`;
  return (
    <div className="text-xs text-text-muted">
      {metric.total > 0 && metric.link ? (
        <InternalLink
          href={href(metric.link)}
          className={`text-accent-primary ${focus}`}
          aria-label={`${systemName} · ${area} ${domain} ${text}`}
        >
          {text}
        </InternalLink>
      ) : (
        text
      )}
    </div>
  );
}
function Cells({ row }: { row: Row }) {
  const area = row.analytics_area_name ?? COPY.unset;
  const cell = 'px-3 py-3 align-top text-sm text-text-primary';
  const count = (domain: string, label: string, metric: Count | undefined) => (
    <CountLine
      systemName={row.managed_system_name}
      domain={domain}
      area={area}
      label={label}
      metric={metric}
    />
  );
  const ratio = (domain: string, label: string, metric: Ratio | undefined) => (
    <RatioLine
      systemName={row.managed_system_name}
      domain={domain}
      area={area}
      label={label}
      metric={metric}
    />
  );
  const m = COPY.metrics;
  return (
    <>
      <td className={cell}>
        {row.voc ? (
          <>
            {count('VOC', m.total, row.voc.total)}
            {count('VOC', m.unassigned, row.voc.unassigned)}
            {count('VOC', m.high_no_followup, row.voc.high_no_followup)}
            {ratio('VOC', m.task_link, row.voc.task_link)}
          </>
        ) : (
          <Unavailable />
        )}
      </td>
      <td className={cell}>
        {row.finding ? (
          <>
            {count('Finding', m.active, row.finding.active)}
            {count('Finding', m.no_execution, row.finding.no_execution)}
            {ratio('Finding', m.execution, row.finding.execution)}
          </>
        ) : (
          <Unavailable />
        )}
      </td>
      <td className={cell}>
        {row.task ? (
          <>
            {count('Task', m.in_flight, row.task.in_flight)}
            {count('Task', m.overdue, row.task.overdue)}
            {count('Task', m.public_update_missing, row.task.public_update_missing)}
            {count('Task', m.reporter_update_needed, row.task.reporter_update_needed)}
            {ratio('Task', m.released_update, row.task.released_update)}
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-text-muted">
              {Object.entries(row.task.by_status).map(([status, metric]) => (
                <CountLine
                  key={status}
                  domain="Task"
                  systemName={row.managed_system_name}
                  area={area}
                  label={status[0]?.toUpperCase() + status.slice(1)}
                  metric={metric}
                />
              ))}
            </div>
          </>
        ) : (
          <Unavailable />
        )}
      </td>
      <td className={cell}>
        {row.survey ? (
          <>
            {count('Survey', m.open, row.survey.open)}
            {count('Survey', m.follow_up_needed, row.survey.follow_up_needed)}
          </>
        ) : (
          <Unavailable />
        )}
      </td>
    </>
  );
}
function ReportColumns() {
  return (
    <colgroup>
      <col className="w-[14%]" />
      <col className="w-[20%]" />
      <col className="w-[16%]" />
      <col className="w-[34%]" />
      <col className="w-[16%]" />
    </colgroup>
  );
}
export function AnalyticsAreaReportTable({ report }: { report: DashboardAreaReport }) {
  const domains = ['voc', 'finding', 'task', 'survey'] as const;
  const names = { voc: 'VOC', finding: 'Finding', task: 'Task', survey: 'Survey' };
  const available = report.classification_context.flatMap((context) =>
    domains.flatMap((domain) => (context[domain] ? [context[domain]] : [])),
  );
  const unclassified =
    report.items.length > 0 &&
    available.some((value) => value.total > 0) &&
    available.every((value) => value.classified === 0);
  const systems = [...new Set(report.items.map((row) => row.managed_system_id))];
  return (
    <div className="flex flex-col gap-4" data-testid="analytics-area-report">
      <div>
        <p className="text-sm text-text-muted">{COPY.scope}</p>
        <p className="mt-2 text-xs text-text-muted">
          {COPY.computed} ·{' '}
          <time dateTime={report.computed_at}>{formatRecoveryTime(report.computed_at)}</time>
        </p>
      </div>
      {unclassified && <p className="text-sm text-text-muted">{COPY.unclassified}</p>}
      {systems.map((id) => {
        const rows = report.items.filter((row) => row.managed_system_id === id);
        const first = rows[0];
        const context = report.classification_context.find((item) => item.managed_system_id === id);
        return (
          <section key={id} className="rounded-md border border-border-subtle bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  {first?.managed_system_name}{' '}
                  {first?.managed_system_archived && (
                    <span className="text-xs text-text-muted">{COPY.archived}</span>
                  )}
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  {domains
                    .flatMap((domain) =>
                      context?.[domain]
                        ? [
                            `${names[domain]} 분류 ${context[domain].classified}/${context[domain].total}`,
                          ]
                        : [],
                    )
                    .join(' · ')}
                </p>
              </div>
              <InternalLink
                className={`text-xs text-accent-primary ${focus}`}
                href={`/tasks?view=requests&managedSystem=${id}`}
              >
                {COPY.review} · {first?.managed_system_name} {COPY.reviewScope}
              </InternalLink>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left">
                <ReportColumns />
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-raised">
                    {['Analytics Area', 'VOC', 'Finding', 'Task', 'Survey'].map((name) => (
                      <th
                        key={name}
                        scope="col"
                        className="px-3 py-2 text-xs font-medium text-text-muted"
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.analytics_area_id ?? 'unset'}
                      className="border-b border-border-subtle last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-3 py-3 align-top text-sm font-medium text-text-primary"
                      >
                        {row.analytics_area_name ?? COPY.unset}
                        {row.analytics_area_archived && (
                          <span className="ml-2 text-xs text-text-muted">{COPY.archived}</span>
                        )}
                      </th>
                      <Cells row={row} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
