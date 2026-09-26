import { ProgressNotesSection } from '@/features/cross-system/progress-notes/ProgressNotesSection';
import { getTask } from '@/lib/api';
import { getMilestone } from '@/lib/api/milestones';
import { ApiError } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import type { TaskDetailDto, TaskStatus } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  InternalTaskBadge,
  LinkedEntityTrail,
  ManagedSystemPill,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  PermissionBlockedPanel,
  SeverityBadge,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

const PRIORITY_SEVERITY: Record<TaskDetailDto['priority'], 'low' | 'medium' | 'high' | 'critical'> =
  {
    low: 'low',
    medium: 'medium',
    high: 'high',
    urgent: 'critical',
  };

const SECTIONS: PanelSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'source', label: 'Source' },
  { id: 'context', label: 'Context' },
  { id: 'notes', label: 'Progress notes' },
];

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

function optionalDisplayId(value: { id: string; display_id?: string | null }): string {
  return value.display_id?.trim() ? value.display_id : shortId(value.id);
}

export interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  /** 생략 시 backlog. copy URL과 board 전용 footer의 스위치. */
  view?: 'backlog' | 'board';
  /** board만 전달. 상태 그래프는 이 컴포넌트가 모른다. */
  onMoveToNextStatus?: (taskId: string) => void;
}

export function TaskDetailPanel({
  taskId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  view = 'backlog',
  onMoveToNextStatus,
}: TaskDetailPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const taskQuery = useQuery({
    queryKey: ['task', taskId] as const,
    queryFn: ({ signal }) => getTask(taskId, signal),
    staleTime: 30 * 1000,
  });
  // #514 B3b: the Milestone row is a read — GET /milestones/:id only. The
  // assign/unassign POST has no control in this panel.
  const milestoneId = taskQuery.data?.milestone_id ?? null;
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId as string, signal),
    enabled: milestoneId !== null,
    staleTime: 30 * 1000,
  });
  const milestoneNotFound =
    milestoneQuery.error instanceof ApiError && milestoneQuery.error.status === 404;
  const { data: me } = useMe();
  // #377: backend gates Task comment GET+POST behind finding.manage + elevated
  // role on the Task's Managed System — same gate drives the composer hint.
  // Key resolves once the task loads; until then the check runs workspace-wide
  // and is superseded by the scoped key (display hint only, backend authoritative).
  const notesManageQuery = usePermissionCheck({
    capability: 'finding.manage',
    ...(taskQuery.data !== undefined
      ? { managedSystemId: taskQuery.data.primary_managed_system_id }
      : {}),
  });
  const canManageNotes =
    me?.actor.role_level === 'admin' || notesManageQuery.data?.state === 'approved';

  if (taskQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Task...</div>;
  }
  if (isPermissionDenied(taskQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task detail"
        reason={taskQuery.error.message}
        className="m-4"
      />
    );
  }
  if (taskQuery.error || !taskQuery.data) {
    return <div className="p-4 text-sm text-accent-danger">Task detail unavailable.</div>;
  }

  const task: TaskDetailDto = taskQuery.data;
  const source = task.source;
  const sourceFinding = source?.finding as
    | (NonNullable<TaskDetailDto['source']>['finding'] & { display_id?: string | null })
    | undefined;
  const sourceVoc = source?.voc;
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task"
        id={task.display_id}
        onClose={onClose}
        extras={
          <DetailPanelHeaderActions
            entityKind="task"
            entityId={task.id}
            copyUrl={`/tasks?view=${view}&param=${task.id}`}
          />
        }
      />
      <DetailPanelSectionNav sections={SECTIONS} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={task.title}
            badges={
              <>
                <InternalTaskBadge status={task.status} />
                <SeverityBadge severity={PRIORITY_SEVERITY[task.priority]} />
              </>
            }
          />
        </div>

        <div data-anchor="properties" className="border-t border-border-subtle py-2">
          <PanelSectionTitle className="px-4">Properties</PanelSectionTitle>
          <FieldRow label="Status">
            <InternalTaskBadge status={task.status} />
          </FieldRow>
          <FieldRow label="Priority">
            <SeverityBadge severity={PRIORITY_SEVERITY[task.priority]} />
          </FieldRow>
          <FieldRow label="Assignee">
            {task.assignee_actor_id ? (
              <span className="text-sm text-text-primary">
                {actorNamesById.get(task.assignee_actor_id) ?? 'Assigned'}
              </span>
            ) : (
              <span className="text-accent-danger">Unassigned</span>
            )}
          </FieldRow>
          <FieldRow label="Due">
            {task.due_date ?? <span className="text-text-muted">-</span>}
          </FieldRow>
          <FieldRow label="Managed System">
            <ManagedSystemPill
              name={managedSystemNamesById.get(task.primary_managed_system_id) ?? 'Managed System'}
            />
          </FieldRow>
          <FieldRow label="Milestone">
            {milestoneQuery.data && !milestoneNotFound ? (
              <span className="text-sm text-text-primary">
                {milestoneQuery.data.display_id} {milestoneQuery.data.title}
              </span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </FieldRow>
        </div>

        <div data-anchor="source" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Source evidence</PanelSectionTitle>
          {sourceFinding ? (
            <div className="mt-2 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3">
              <span className="text-xs text-text-muted">From finding</span>
              <div className="text-sm font-medium text-text-primary">
                {sourceFinding.title}
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {optionalDisplayId(sourceFinding)}
                </span>
              </div>
              <p className="text-sm text-text-muted">{sourceFinding.summary}</p>
              <div className="flex flex-wrap gap-2">
                <OutlineBadge>Evidence · {sourceFinding.evidence_count}</OutlineBadge>
                {source?.task_request && (
                  <OutlineBadge>Task Request · {source.task_request.status}</OutlineBadge>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-text-muted">Standalone task</div>
          )}
        </div>

        <div data-anchor="context" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Linked context</PanelSectionTitle>
          {/* #378: the source VOC is rendered ONLY from the backend payload's
              visibility verdict. `allowed` leads the trail; summary_visible /
              denied render a blocked panel without identifiers (ADR-0023);
              hidden / absent render nothing — no synthesis, no existence leak. */}
          {sourceVoc && sourceVoc.visibility_state !== 'allowed' && (
            <PermissionBlockedPanel
              state={sourceVoc.visibility_state}
              category="Source VOC"
              className="mt-2"
            />
          )}
          <div className="mt-2">
            <LinkedEntityTrail
              nodes={[
                ...(sourceVoc?.visibility_state === 'allowed'
                  ? [
                      {
                        type: 'voc' as const,
                        id: sourceVoc.id,
                        display_id: sourceVoc.display_id,
                        title: sourceVoc.title,
                        // Same destination as every other VOC link in the app:
                        // the /vocs URL-state selection.
                        onNavigate: () => {
                          void navigate({ to: '/vocs', search: { selected: sourceVoc.id } });
                        },
                      },
                    ]
                  : []),
                ...(sourceFinding
                  ? [
                      {
                        type: 'finding' as const,
                        id: sourceFinding.id,
                        display_id: optionalDisplayId(sourceFinding),
                        title: sourceFinding.title,
                        // The trail is the only place this panel names the source
                        // Finding, so it has to be the way there too.
                        onNavigate: () => {
                          void navigate({
                            to: '/findings/$findingId',
                            params: { findingId: sourceFinding.id },
                          });
                        },
                      },
                    ]
                  : []),
                // The last node is the task being viewed — deliberately not
                // navigable, it is the "you are here" marker.
                {
                  type: 'task' as const,
                  id: task.id,
                  display_id: task.display_id,
                  title: task.title,
                },
              ]}
            />
          </div>
        </div>

        <div data-anchor="notes" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Progress notes</PanelSectionTitle>
          <div className="mt-2">
            <ProgressNotesSection
              resource={{ kind: 'task', id: task.id }}
              canCompose={canManageNotes}
              actorNamesById={actorNamesById}
              renderStatusBadge={(status: TaskStatus) => <InternalTaskBadge status={status} />}
            />
          </div>
        </div>
      </div>
      {view === 'board' && task.status !== 'released' && onMoveToNextStatus && (
        <div className="border-t border-border-subtle p-3">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => onMoveToNextStatus(task.id)}
          >
            <ArrowRight className="h-4 w-4" />
            Move to next status
          </Button>
        </div>
      )}
    </aside>
  );
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
