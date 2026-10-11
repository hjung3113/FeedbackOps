import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { useDraggable } from '@dnd-kit/core';
import type { TaskDto } from '@fops/shared';
import { SeverityBadge, UnassignedBadge, UserAvatar } from '@fops/ui';

import { taskPriorityToSeverity } from '../../adapters/taskDisplayAdapters';

export function TaskBoardCard({
  task,
  selected,
  onSelect,
  managedSystemName,
  assigneeName,
  enabled,
}: {
  task: TaskDto;
  selected: boolean;
  onSelect: () => void;
  managedSystemName: string;
  assigneeName?: string | undefined;
  enabled: boolean;
}) {
  const draggable = useDraggable({ id: task.id, data: { task }, disabled: !enabled });
  return (
    <button
      ref={draggable.setNodeRef}
      data-task-board-card-id={task.id}
      type="button"
      {...draggable.listeners}
      {...draggable.attributes}
      onClick={onSelect}
      aria-label={`${task.display_id}: ${task.title}`}
      // oxlint-disable-next-line shadcn/no-arbitrary-values -- Keep colour/shadow motion but restore source opacity immediately after the drop overlay leaves.
      className={`w-full cursor-grab rounded-sm border border-border-subtle bg-surface-card p-3 text-left shadow-sm transition-[color,background-color,border-color,box-shadow] ${selected ? 'ring-1 ring-border-selected' : ''} ${draggable.isDragging ? 'opacity-35' : ''}`}
    >
      <TaskBoardCardContent
        task={task}
        managedSystemName={managedSystemName}
        assigneeName={assigneeName}
      />
      {!enabled && <span className="sr-only">상태 그룹화일 때만 드래그로 상태가 변경됩니다.</span>}
    </button>
  );
}

export function TaskBoardCardPreview({
  task,
  selected,
  managedSystemName,
  assigneeName,
}: {
  task: TaskDto;
  selected: boolean;
  managedSystemName: string;
  assigneeName?: string | undefined;
}) {
  return (
    <div
      aria-hidden="true"
      className={`w-full rounded-sm border border-border-subtle bg-surface-card p-3 text-left shadow-sm ${selected ? 'ring-1 ring-border-selected' : ''}`}
    >
      <TaskBoardCardContent
        task={task}
        managedSystemName={managedSystemName}
        assigneeName={assigneeName}
      />
    </div>
  );
}

function TaskBoardCardContent({
  task,
  managedSystemName,
  assigneeName,
}: {
  task: TaskDto;
  managedSystemName: string;
  assigneeName?: string | undefined;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-text-muted">{task.display_id}</span>
        <SeverityBadge
          severity={taskPriorityToSeverity(task.priority)}
          label={TASK_PRIORITY_LABELS[task.priority]}
        />
      </div>
      {/* TaskDto does not project finding linkage or linked VOC counts; only TaskDetailDto.source does. */}
      <div className="mt-2 text-sm font-medium text-text-primary">{task.title}</div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-text-muted">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-info" />
          {managedSystemName}
        </span>
        {assigneeName ? (
          <UserAvatar user={{ display_name: assigneeName }} size="sm" />
        ) : (
          <UnassignedBadge />
        )}
      </div>
    </>
  );
}
