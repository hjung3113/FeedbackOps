import type { DashboardSummary } from '@fops/shared';
import { Button } from '@fops/ui';
import { GLOSSARY } from '@/lib/copy/glossary';
import { ArrowRight } from 'lucide-react';
import type * as React from 'react';

type DashboardQueue = DashboardSummary['action_queues'][number];
type QueueId = DashboardQueue['id'];

const QUEUE_COPY: Record<QueueId, { title: string; detail: (count: number) => string }> = {
  'unassigned-voc': {
    title: '미배정 VOC',
    detail: (count) =>
      `담당자가 지정되지 않은 VOC가 ${count}건 누적되어 있습니다. 우선 분류와 담당 배정이 필요합니다.`,
  },
  'high-severity-unlinked': {
    title: GLOSSARY.highNoLink,
    detail: () => 'High/Critical severity인 VOC 중 Finding 연결이 없는 항목.',
  },
  'actionable-finding-no-execution': {
    title: '실행 계획 없는 Finding',
    detail: () => 'Active 상태의 Finding 중 Task Request 또는 Task 링크가 없는 항목입니다.',
  },
  'released-task-unresolved-voc': {
    title: 'Released Task · 미해결 VOC',
    detail: () =>
      'Task는 Released지만 연결된 Reporter-facing VOC Status가 해결됨이 아닙니다. 공개 업데이트 검토가 필요합니다.',
  },
  'bad-outcome-no-followup': {
    title: '후속 조치 없는 부정 Outcome Survey',
    detail: () => 'Negative outcome survey 결과에 대한 후속 Finding/Task가 구성되어 있지 않습니다.',
  },
  'permission-requests-pending': {
    title: '검토 대기 중인 권한 요청',
    detail: () => 'Workspace Admin 검토를 기다리는 elevated/scope 권한 요청.',
  },
};

const QUEUE_SEVERITY_TONE: Record<
  DashboardQueue['severity'],
  { label: string; count: string; badge: string }
> = {
  urgent: {
    label: '복구',
    count: 'text-accent-danger',
    badge: 'bg-accent-danger/10 text-accent-danger',
  },
  warn: {
    label: '후속 조치',
    count: 'text-accent-warn',
    badge: 'bg-accent-warn/10 text-accent-warn',
  },
  info: {
    label: '검토',
    count: 'text-text-primary',
    badge: 'bg-accent-info/10 text-accent-info',
  },
};

export const INTEGRATION_DASHBOARD_QUEUE_ORDER: readonly QueueId[] = [
  'unassigned-voc',
  'actionable-finding-no-execution',
  'released-task-unresolved-voc',
  'bad-outcome-no-followup',
  'high-severity-unlinked',
  'permission-requests-pending',
];

export function IntegrationDashboardQueueCard({
  queue,
}: { queue: DashboardQueue }): React.ReactElement {
  const copy = QUEUE_COPY[queue.id];
  const tone = QUEUE_SEVERITY_TONE[queue.severity];

  return (
    <article
      className="flex min-h-52 flex-col rounded-md border border-border-subtle bg-surface-card p-4"
      data-testid={`integration-queue-card-${queue.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-text-primary">{copy.title}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">{copy.detail(queue.count)}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-medium uppercase ${tone.badge}`}
        >
          {tone.label}
        </span>
      </div>

      <div
        className={`mt-3 text-3xl font-semibold tabular-nums ${tone.count}`}
        data-testid={`integration-queue-count-${queue.id}`}
      >
        {queue.count}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        {queue.secondary_action !== null ? (
          <a
            className="min-w-0 truncate text-xs text-text-secondary hover:text-text-primary"
            data-testid={`integration-queue-secondary-${queue.id}`}
            href={queue.secondary_action.route}
          >
            {queue.secondary_action.label}
          </a>
        ) : (
          <span />
        )}
        <Button asChild variant="primary" size="sm">
          <a
            className="inline-flex shrink-0 items-center gap-1"
            data-testid={`integration-queue-primary-${queue.id}`}
            href={queue.next_action.route}
          >
            {queue.next_action.label}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </article>
  );
}

export interface IntegrationJumpCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  stat?: string;
  statLabel?: string;
  testId: string;
}

export function IntegrationJumpCard({
  href,
  title,
  description,
  icon,
  stat,
  statLabel,
  testId,
}: IntegrationJumpCardProps): React.ReactElement {
  return (
    <a
      className="flex min-h-32 flex-col gap-3 rounded-md border border-border-subtle bg-surface-card p-4 hover:bg-surface-row-hover"
      data-testid={testId}
      href={href}
    >
      <span className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-primary/10 text-accent-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-primary">{title}</span>
          {stat !== undefined && statLabel !== undefined && (
            <span className="block text-xs text-text-muted">{statLabel}</span>
          )}
        </span>
        {stat !== undefined && (
          <span
            className="text-lg font-semibold tabular-nums text-text-primary"
            data-testid={`${testId}-stat`}
          >
            {stat}
          </span>
        )}
      </span>
      <span className="text-xs leading-5 text-text-muted">{description}</span>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent-primary">
        Open <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </a>
  );
}
