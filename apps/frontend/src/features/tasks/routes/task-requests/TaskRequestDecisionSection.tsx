import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import type { TaskDto } from '@fops/shared';
import { Button, InternalTaskBadge, ObjectRow, PanelSectionTitle, UnassignedBadge } from '@fops/ui';
import { Check, FileSearch, Link2, XCircle } from 'lucide-react';

import { TaskRequestConversionForm } from './TaskRequestConversionForm';
import { TaskRequestLinkedTask } from './TaskRequestLinkedTask';
import { type NameMaps, dot } from './TaskRequestRow';
import type { UseTaskRequestConversionResult } from './useTaskRequestConversion';
import type { UseTaskRequestDecisionResult } from './useTaskRequestDecision';
import type { UseTaskRequestLinkResult } from './useTaskRequestLink';

export function TaskRequestDecisionSection({
  names,
  resultingTask,
  decision,
  conversion,
  link,
}: {
  names: NameMaps;
  resultingTask: TaskDto | null;
  decision: UseTaskRequestDecisionResult;
  conversion: UseTaskRequestConversionResult;
  link: UseTaskRequestLinkResult;
}) {
  return (
    <section data-anchor="decision" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>검토 결정</PanelSectionTitle>
      <div className="flex flex-col gap-2">
        {resultingTask && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">연결된 Task</span>
            <TaskRequestLinkedTask task={resultingTask} />
          </div>
        )}
        {!resultingTask && (decision.canApprove || conversion.canConvert) && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">주요 결정</legend>
            {decision.canApprove && (
              <Button
                type="button"
                variant="primary"
                className="w-full"
                loading={decision.isPending}
                onClick={decision.approve}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                승인
              </Button>
            )}
            {conversion.canConvert && (
              <Button
                type="button"
                variant={conversion.open ? 'secondary' : 'primary'}
                size={conversion.open ? 'sm' : 'md'}
                className="w-full"
                onClick={() => {
                  conversion.setOpen((open) => !open);
                  link.setOpen(false);
                }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Task로 전환
              </Button>
            )}
          </fieldset>
        )}
        {!resultingTask &&
          (link.canLinkExisting || decision.canRequestEvidence || decision.canReject) && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="sr-only">보조 결정</legend>
              {(link.canLinkExisting || decision.canRequestEvidence) && (
                <div
                  className={
                    link.canLinkExisting && decision.canRequestEvidence
                      ? 'grid grid-cols-2 gap-2'
                      : 'flex flex-col gap-2'
                  }
                >
                  {link.canLinkExisting && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        link.setOpen((open) => !open);
                        conversion.setOpen(false);
                      }}
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      기존 Task 연결
                    </Button>
                  )}
                  {decision.canRequestEvidence && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      loading={decision.isPending}
                      onClick={decision.requestEvidence}
                    >
                      <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                      근거 추가 요청
                    </Button>
                  )}
                </div>
              )}
              {decision.canReject && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-accent-danger text-accent-danger hover:bg-accent-danger/10"
                  loading={decision.isPending}
                  onClick={decision.reject}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  반려
                </Button>
              )}
            </fieldset>
          )}
        {!resultingTask && link.open && (
          <div className="max-h-52 overflow-y-auto rounded border border-border-subtle bg-surface-card">
            {link.isTasksLoading && (
              <div className="p-3 text-xs text-text-muted">Task 불러오는 중...</div>
            )}
            {link.inScopeTasks?.map((task) => (
              <ObjectRow
                key={task.id}
                id={task.display_id}
                title={task.title}
                density="compact"
                severity="low"
                onClick={() => link.link(task.id)}
                badges={<InternalTaskBadge status={task.status} />}
                meta={
                  <>
                    <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
                    {dot()}
                    <span>
                      {task.assignee_actor_id ? (
                        (names.actorsById[task.assignee_actor_id]?.display_name ?? '담당자 지정됨')
                      ) : (
                        <UnassignedBadge />
                      )}
                    </span>
                  </>
                }
              />
            ))}
            {link.inScopeTasks?.length === 0 && (
              <div className="p-3 text-xs text-text-muted">범위 내 Task가 없습니다.</div>
            )}
          </div>
        )}
        {!resultingTask && conversion.open && (
          <TaskRequestConversionForm conversion={conversion} names={names} />
        )}
      </div>
    </section>
  );
}
