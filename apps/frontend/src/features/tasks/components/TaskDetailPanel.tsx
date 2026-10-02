import { ListStateMessage } from '@/components/ListStateMessage';
import { ProgressNotesSection } from '@/features/cross-system/progress-notes/ProgressNotesSection';
import { getTask } from '@/lib/api';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { getMilestone } from '@/lib/api/milestones';
import { isPermissionDenied } from '@/lib/api/types';
import { useMe } from '@/lib/auth/useMe';
import { TASK_PRIORITY_LABELS, TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
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
  Skeleton,
  UnassignedBadge,
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

// ADR-0057 A2 amendment: keep panel navigation in Korean and preserve domain nouns.
export const TASK_DETAIL_SECTIONS: PanelSection[] = [
  { id: 'overview', label: '요약' },
  { id: 'properties', label: '속성' },
  { id: 'source', label: '출처' },
  { id: 'context', label: '맥락' },
  { id: 'notes', label: '진행 메모' },
];

function TaskDetailPanelFrame({
  onClose,
  children,
  headerId,
  headerExtras,
  loading,
  ariaLive = 'off',
}: {
  onClose: () => void;
  children: React.ReactNode;
  headerId?: string;
  headerExtras?: React.ReactNode;
  loading?: boolean;
  ariaLive?: 'off' | 'polite';
}) {
  return (
    <aside
      aria-busy={loading ?? false}
      {...(loading ? { 'aria-label': 'Task 상세 불러오는 중' } : {})}
      className="flex h-full flex-col bg-surface-detail"
    >
      <DetailPanelHeader
        kind="task"
        {...(headerId !== undefined ? { id: headerId } : {})}
        onClose={onClose}
        {...(headerExtras !== undefined ? { extras: headerExtras } : {})}
      />
      <div aria-live={ariaLive} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </aside>
  );
}

function TaskDetailSkeletonContent({ hasActionFooter }: { hasActionFooter: boolean }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="flex shrink-0 gap-4 border-b border-border-subtle px-4 py-3"
      >
        {TASK_DETAIL_SECTIONS.map((section) => (
          <Skeleton className="h-4 w-12" key={section.id} />
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-3/4" />
        <div className="grid gap-3 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
      {hasActionFooter ? (
        <div aria-hidden="true" className="shrink-0 border-t border-border-subtle p-3">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
    </>
  );
}

export interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  /** 생략 시 backlog. copy URL과 board 전용 footer의 스위치. */
  view?: 'backlog' | 'my' | 'board';
  /** Board only: whether the loaded Task can show its action footer. */
  hasActionFooter?: boolean;
  /** board만 전달. 상태 그래프는 이 컴포넌트가 모른다. */
  onMoveToNextStatus?: (taskId: string) => void;
}

export function TaskDetailPanel({
  taskId,
  onClose,
  actorNamesById,
  managedSystemNamesById,
  view = 'backlog',
  hasActionFooter = false,
  onMoveToNextStatus,
}: TaskDetailPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const taskQuery = useQuery({
    queryKey: ['task', taskId] as const,
    queryFn: ({ signal }) => getTask(taskId, signal),
    staleTime: 30 * 1000,
  });
  useDocumentTitle(
    taskQuery.isSuccess && !taskQuery.isFetching && taskQuery.data?.id === taskId
      ? formatRecordDocumentTitle({
          displayId: taskQuery.data.display_id,
          title: taskQuery.data.title,
        })
      : null,
  );
  // #514 B3b: the Milestone row is a read — GET /milestones/:id only. The
  // assign/unassign POST has no control in this panel.
  const milestoneId = taskQuery.data?.milestone_id ?? null;
  const milestoneQuery = useQuery({
    queryKey: ['milestone', milestoneId] as const,
    queryFn: ({ signal }) => getMilestone(milestoneId as string, signal),
    enabled: milestoneId !== null,
    staleTime: 30 * 1000,
  });
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
    return (
      <TaskDetailPanelFrame loading ariaLive="polite" onClose={onClose}>
        <TaskDetailSkeletonContent hasActionFooter={hasActionFooter} />
      </TaskDetailPanelFrame>
    );
  }
  if (isPermissionDenied(taskQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task detail"
        reason={PERMISSION_BLOCKED_REASONS.taskDetail}
        className="m-4"
      />
    );
  }
  if (taskQuery.error || !taskQuery.data) {
    return (
      <TaskDetailPanelFrame ariaLive="polite" onClose={onClose}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <ListStateMessage
            variant="error"
            title="Task 상세를 불러오지 못했습니다."
            body={mapUnknownError(taskQuery.error).message}
            action={{
              label: '다시 시도',
              onClick: () => {
                void taskQuery.refetch();
              },
            }}
          />
        </div>
      </TaskDetailPanelFrame>
    );
  }

  const task: TaskDetailDto = taskQuery.data;
  const source = task.source;
  const sourceFinding = source?.finding;
  const sourceVoc = source?.voc;
  return (
    <TaskDetailPanelFrame
      ariaLive="off"
      headerId={task.display_id}
      headerExtras={
        <DetailPanelHeaderActions
          entityKind="task"
          entityId={task.id}
          copyUrl={`/tasks?view=${view}&param=${task.id}`}
        />
      }
      onClose={onClose}
    >
      <DetailPanelSectionNav sections={TASK_DETAIL_SECTIONS} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelSectionTitle className="px-4">요약</PanelSectionTitle>
          <PanelTitleBlock
            title={task.title}
            badges={
              <>
                <InternalTaskBadge status={task.status} />
                <SeverityBadge
                  severity={PRIORITY_SEVERITY[task.priority]}
                  label={TASK_PRIORITY_LABELS[task.priority]}
                />
              </>
            }
          />
        </div>

        <div data-anchor="properties" className="border-t border-border-subtle py-2">
          <PanelSectionTitle className="px-4">속성</PanelSectionTitle>
          <FieldRow label="상태">
            <InternalTaskBadge status={task.status} />
          </FieldRow>
          <FieldRow label="우선순위">
            <SeverityBadge
              severity={PRIORITY_SEVERITY[task.priority]}
              label={TASK_PRIORITY_LABELS[task.priority]}
            />
          </FieldRow>
          <FieldRow label="담당자">
            {task.assignee_actor_id ? (
              <span className="text-sm text-text-primary">
                {actorNamesById.get(task.assignee_actor_id) ?? GLOSSARY.unknownUser}
              </span>
            ) : (
              <UnassignedBadge />
            )}
          </FieldRow>
          <FieldRow label="마감일">
            {task.due_date ?? <span className="text-text-muted">-</span>}
          </FieldRow>
          <FieldRow label="Managed System">
            <ManagedSystemPill
              name={managedSystemNamesById.get(task.primary_managed_system_id) ?? 'Managed System'}
            />
          </FieldRow>
          <FieldRow label="Milestone">
            {milestoneQuery.data && milestoneQuery.error === null ? (
              <span className="text-sm text-text-primary">
                {milestoneQuery.data.display_id} {milestoneQuery.data.title}
              </span>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </FieldRow>
        </div>

        <div data-anchor="source" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>출처</PanelSectionTitle>
          {sourceFinding ? (
            <div className="mt-2 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3">
              <span className="text-xs text-text-muted">{GLOSSARY.fromFinding}</span>
              <div className="text-sm font-medium text-text-primary">
                {sourceFinding.title}
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {sourceFinding.display_id}
                </span>
              </div>
              <p className="text-sm text-text-muted">{sourceFinding.summary}</p>
              <div className="flex flex-wrap gap-2">
                <OutlineBadge>Evidence · {sourceFinding.evidence_count}</OutlineBadge>
                {source?.task_request && (
                  <OutlineBadge>
                    Task Request · {TASK_REQUEST_STATUS_LABELS[source.task_request.status]}
                  </OutlineBadge>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-text-muted">단독 Task</div>
          )}
        </div>

        <div data-anchor="context" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>맥락</PanelSectionTitle>
          {/* #378: the source VOC is rendered ONLY from the backend payload's
              visibility verdict. `allowed` leads the trail; summary_visible /
              denied render a blocked panel without identifiers (ADR-0023);
              hidden / absent render nothing — no synthesis, no existence leak. */}
          {sourceVoc && sourceVoc.visibility_state !== 'allowed' && (
            <PermissionBlockedPanel
              state={sourceVoc.visibility_state}
              category="출처 VOC"
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
                        display_id: sourceFinding.display_id,
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
          <PanelSectionTitle>진행 메모</PanelSectionTitle>
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
            다음 상태로 이동
          </Button>
        </div>
      )}
    </TaskDetailPanelFrame>
  );
}
