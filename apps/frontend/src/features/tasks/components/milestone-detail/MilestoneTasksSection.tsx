import { isPermissionDenied } from '@/lib/api/types';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import type { TaskDto } from '@fops/shared';
import { PermissionBlockedPanel } from '@fops/ui';

import { resolveTaskAssignee } from '../../adapters/taskDisplayAdapters';
import { MilestonePanelSectionTitle } from '../MilestoneIdentity';
import { MilestoneTaskRow } from './MilestoneTaskRow';

export function MilestoneTasksSection({
  childTasks,
  error,
  actorNamesById,
}: {
  childTasks: TaskDto[] | undefined;
  error: Error | null;
  actorNamesById: ReadonlyMap<string, string>;
}) {
  return (
    // #514 B2d-tasks — flat child Task list (screen-milestones.jsx:402-416).
    // The prototype's Add task action has no #514 writer behind it, so the
    // section ships read-only; assign/unassign lives on the Task detail.
    <div data-anchor="tasks" className="mb-8">
      <MilestonePanelSectionTitle>
        {childTasks === undefined ? 'Tasks' : `Tasks · ${childTasks.length}`}
      </MilestonePanelSectionTitle>
      {error !== null ? (
        isPermissionDenied(error) ? (
          // B2d fixup F1 — a denied child-list read is the permission contract, not an outage.
          <PermissionBlockedPanel
            state="denied"
            category="Task 목록"
            reason={PERMISSION_BLOCKED_REASONS.milestoneTasks}
          />
        ) : (
          // Same terminal copy as the Tasks list route (TaskListRoute).
          <div className="py-3 text-center text-xs text-text-muted">
            Task 목록을 표시할 수 없습니다.
          </div>
        )
      ) : childTasks !== undefined && childTasks.length === 0 ? (
        <div className="py-3 text-center text-xs text-text-muted">
          아직 연결된 Task 가 없습니다.
        </div>
      ) : childTasks !== undefined ? (
        <div className="flex flex-col gap-1.5">
          {childTasks.map((task) => {
            const assignee = resolveTaskAssignee(task.assignee_actor_id, actorNamesById);
            const assigneeName =
              assignee.kind === 'unassigned'
                ? undefined
                : assignee.kind === 'resolved'
                  ? assignee.displayName
                  : GLOSSARY.unknownUser;
            return <MilestoneTaskRow key={task.id} task={task} assigneeName={assigneeName} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
