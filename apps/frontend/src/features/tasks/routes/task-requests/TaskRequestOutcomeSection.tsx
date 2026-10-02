import { GLOSSARY } from '@/lib/copy/glossary';
import { formatShortDateTime } from '@/lib/format/datetime';
import type { TaskRequestDto } from '@fops/shared';
import { PanelSectionTitle } from '@fops/ui';

import { TaskRequestLinkedTask } from './TaskRequestLinkedTask';
import { TaskRequestBadge } from './TaskRequestRow';

export function TaskRequestOutcomeSection({
  item,
  reviewerName,
  taskForOutcome,
}: {
  item: TaskRequestDto;
  reviewerName: string | undefined;
  taskForOutcome: { id: string; title: string; display_id: string } | null;
}) {
  return (
    <section data-anchor="outcome" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>결정 요약</PanelSectionTitle>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TaskRequestBadge status={item.status} />
          <span className="text-xs text-text-muted">
            검토자{' '}
            <strong className="text-text-secondary">{reviewerName ?? GLOSSARY.unknownUser}</strong>
            {item.decided_at && <> · {formatShortDateTime(item.decided_at)}</>}
          </span>
        </div>
        {item.decision_reason && (
          <div className="rounded border border-border-subtle bg-surface-card px-3 py-2">
            <span className="text-xs text-text-muted">사유</span>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
              {item.decision_reason}
            </p>
          </div>
        )}
        {item.status === 'converted' && taskForOutcome && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">연결된 Task</span>
            <TaskRequestLinkedTask task={taskForOutcome} />
          </div>
        )}
      </div>
    </section>
  );
}
