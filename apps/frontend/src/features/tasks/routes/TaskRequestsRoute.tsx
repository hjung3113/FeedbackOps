import { ListShell, ListToolbar, PermissionBlockedPanel } from '@fops/ui';

import { TaskRequestPanel } from './task-requests/TaskRequestPanel';
import { TaskRequestRow } from './task-requests/TaskRequestRow';
import { type TaskRequestTab, useTaskRequestsQueue } from './task-requests/useTaskRequestsQueue';

export {
  canApproveTaskRequest,
  canConvertTaskRequest,
  canLinkExistingTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from './task-requests/predicates';

export function TaskRequestsRoute({
  selectedParam,
  managedSystem,
}: {
  selectedParam?: string | undefined;
  managedSystem?: string;
}) {
  const queue = useTaskRequestsQueue({ selectedParam, managedSystem });

  if (queue.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Task Requests…</div>;
  }

  if (queue.permissionDeniedError) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task Request queue"
        reason={queue.permissionDeniedError.message}
        className="m-4"
      />
    );
  }
  if (queue.hasError) {
    return <div className="p-4 text-sm text-accent-danger">Task Request queue unavailable.</div>;
  }

  return (
    <ListShell
      list={
        <>
          <ListToolbar
            tabs={queue.tabs}
            activeTab={queue.activeTab}
            onTabChange={(next) => queue.setActiveTab(next as TaskRequestTab)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {queue.shown.map((item) => (
              <TaskRequestRow
                key={item.id}
                item={item}
                selected={queue.selected?.id === item.id}
                names={queue.names}
                onSelect={queue.setSelectedId}
              />
            ))}
            {queue.shown.length === 0 && (
              <div className="px-5 py-8 text-sm text-text-muted">No Task Requests.</div>
            )}
          </div>
        </>
      }
      detailPanel={
        queue.selected ? (
          <TaskRequestPanel
            item={queue.selected}
            names={queue.names}
            currentActorId={queue.currentActorId}
            currentRole={queue.currentRole}
            onClose={() => queue.setSelectedId(null)}
          />
        ) : null
      }
    />
  );
}
