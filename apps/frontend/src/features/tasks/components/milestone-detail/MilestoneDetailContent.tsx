import { listTasks } from '@/lib/api/tasks';
import { isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatDate, formatDateOnly } from '@/lib/format/datetime';
import type { MilestoneDetailDto } from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  FieldRow,
  Input,
  NestedTextBlock,
  PanelTitleBlock,
  PermissionBlockedPanel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import type * as React from 'react';
import {
  MilestoneManagedSystemPill,
  MilestoneOutlineBadge,
  MilestoneOwnerChip,
  MilestonePanelSectionTitle,
} from '../MilestoneIdentity';
import { MilestoneStatusBadge } from '../MilestoneStatusBadge';
import { MilestoneSourceSection } from './MilestoneSourceSection';
import { MilestoneTaskRow } from './MilestoneTaskRow';
import {
  SECTIONS,
  STATUS_OPTIONS,
  milestonePropertyFieldClassName,
  selectClassName,
} from './constants';
import { useMilestoneStatusEdit } from './useMilestoneStatusEdit';
import { useMilestoneTitleEdit } from './useMilestoneTitleEdit';

interface MilestoneDetailContentProps {
  milestone: MilestoneDetailDto;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  analyticsAreaNamesById: ReadonlyMap<string, string>;
  /** B2e fixup — reports whether a header close would discard a title draft. */
  onTitleDirtyChange: (dirty: boolean) => void;
}

export function MilestoneDetailContent({
  milestone,
  scrollRef,
  actorNamesById,
  managedSystemNamesById,
  analyticsAreaNamesById,
  onTitleDirtyChange,
}: MilestoneDetailContentProps) {
  const sourceFinding = milestone.source_finding;

  // #514 B2d-tasks — the section reads the milestone's child rows through the
  // existing tasks client (GET /tasks?milestone_id=); the header count is the
  // real row count, not the prototype's plannedTasks-derived totalPlanned.
  const childTasksQuery = useQuery({
    queryKey: ['tasks', { milestone_id: milestone.id }] as const,
    queryFn: ({ signal }) => listTasks({ milestone_id: milestone.id, signal }),
    staleTime: 30 * 1000,
  });
  // B2d fixup F1 — the child read has its own lifetime, so a terminal error
  // (e.g. a denied refetch after a permission change) must win over the data
  // React Query retains: no count in the nav or section title, no rows. Same
  // contract as the milestone read above (R2-1).
  const childTasks = childTasksQuery.error == null ? childTasksQuery.data?.items : undefined;

  const titleEdit = useMilestoneTitleEdit(milestone, onTitleDirtyChange);
  const statusEdit = useMilestoneStatusEdit({
    milestone,
    titleEditVersion: titleEdit.titleEditVersion,
    setTitleEditVersion: titleEdit.setTitleEditVersion,
    discardTitleEdit: titleEdit.discardTitleEdit,
  });
  const {
    editingTitle,
    titleDraft,
    setTitleDraft,
    titleError,
    setTitleError,
    titleDirty,
    titleMutation,
    startTitleEdit,
    cancelTitleEdit,
    discardTitleEdit,
    submitTitleEdit,
  } = titleEdit;
  const { statusError, statusMutation, handleStatusChange } = statusEdit;

  const areaName =
    milestone.analytics_area_id !== null
      ? analyticsAreaNamesById.get(milestone.analytics_area_id)
      : undefined;
  const ownerName = actorNamesById.get(milestone.owner_actor_id);
  const managedSystemName =
    managedSystemNamesById.get(milestone.primary_managed_system_id) ?? 'Managed System';

  return (
    <>
      <DetailPanelSectionNav
        sections={SECTIONS.map((section) =>
          section.id === 'tasks' && childTasks !== undefined
            ? { ...section, count: childTasks.length }
            : section,
        )}
        scrollRef={scrollRef}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-7 pb-8"
        data-testid="milestone-detail-scroll"
      >
        {/* CP-pixel finding 3 (.review/pixel-514-findings.md): the panel body
            carries the prototype's density (styles.css): .panel-scroll padding
            28/24/32 here, .panel-section 32px bottom rhythm (mb-8) on the
            sections below, .panel-title-block margin-bottom 24 only (the
            shared px-4 py-3 is neutralized — no extra inset), and 12px-pad
            nested cards instead of the earlier 16px-padding bordered cards.
            Feature-local classes only; shared panel components are consumed,
            not redesigned. The 24px scroll padding owns all horizontal insets. */}
        <div data-anchor="overview">
          <PanelTitleBlock
            className="mb-6 p-0"
            title={milestone.title}
            badges={
              <>
                <MilestoneStatusBadge status={milestone.status} />
                <MilestoneManagedSystemPill name={managedSystemName} />
                {areaName !== undefined && (
                  <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
                )}
              </>
            }
          />

          {/* B2e — title-only edit control; distinct from the toolbar's create
              control. Only the title becomes an input; a stale If-Match
              refetches and shows the server title. */}
          {editingTitle ? (
            <form
              className="mb-4 flex flex-col gap-2 rounded-sm border border-border-subtle bg-surface-card p-3"
              onSubmit={(event) => submitTitleEdit(event, statusMutation.isPending)}
            >
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <span>Title</span>
                <Input
                  aria-label="Title"
                  disabled={titleMutation.isPending}
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value);
                    setTitleError(null);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={titleMutation.isPending || statusMutation.isPending}
                >
                  Save
                </Button>
                <Button type="button" variant="subtle" size="sm" onClick={cancelTitleEdit}>
                  Cancel
                </Button>
                {titleError !== null && (
                  <span className="text-sm text-accent-danger">{titleError}</span>
                )}
              </div>
            </form>
          ) : (
            <div className="mb-4 flex justify-end">
              {/* R4 followup — titleMutation and statusMutation both stay
                  pending through their onSuccess invalidateQueries await;
                  reopening the editor in that window captures the stale
                  cached row's title/version, so the button locks while either
                  mutation is pending and the handler refuses the race. */}
              <Button
                variant="subtle"
                size="sm"
                className="gap-1.5"
                disabled={titleMutation.isPending || statusMutation.isPending}
                onClick={() => startTitleEdit(statusMutation.isPending)}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Edit title
              </Button>
            </div>
          )}

          {/* Progress strip — real child-Task buckets from progress (B1c);
              no planned bucket, planned tasks are prototype-only. Nested card
              per finding 3: 12px pad, no extra horizontal inset (the 24px
              scroll padding owns alignment). */}
          <div className="mb-8 flex flex-col gap-2.5 rounded-md bg-surface-canvas p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-text-primary">
                {milestone.progress.released_done} of {milestone.progress.total} tasks released
              </span>
              <span className="text-sm font-semibold tabular-nums text-text-secondary">
                {milestone.progress.percent}%
              </span>
            </div>
            {/* Decorative bar — the strip's text already carries the numbers. */}
            <div className="h-1 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
              <div
                className="h-full bg-accent-primary"
                style={{ width: `${milestone.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-muted">
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.released_done}
                </span>{' '}
                released/done
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.in_flight}
                </span>{' '}
                in flight
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-semibold tabular-nums text-text-secondary">
                  {milestone.progress.queued}
                </span>{' '}
                queued
              </span>
            </div>
          </div>

          {/* Why this milestone exists — required by FR-TASK-004. The prototype
              nests the plain-text why in NestedTextBlock (screen-milestones.jsx):
              plain text, no rich content in the DTO. The shared block keeps its
              border (shown in the reference baseline); only the type scale is
              corrected to the prototype 13px/1.6 (finding P3-1). */}
          <div className="mb-8">
            <MilestonePanelSectionTitle>Why this milestone exists</MilestonePanelSectionTitle>
            <NestedTextBlock className="p-3 text-[13px] leading-[1.6] text-text-secondary">
              {milestone.why}
            </NestedTextBlock>
          </div>

          <MilestoneSourceSection
            sourceFinding={sourceFinding}
            titleDirty={titleDirty}
            discardTitleEdit={discardTitleEdit}
          />

          <div className="mb-8">
            <MilestonePanelSectionTitle>속성</MilestonePanelSectionTitle>
            {/* The scroll container owns horizontal padding. These local rows
                use the prototype's 120px value column and left alignment. */}
            <FieldRow label="Status" className={milestonePropertyFieldClassName}>
              {/* B2e-status (ADR-0050): the closed set is accepted, so the
                  control offers exactly these four values; PATCH is free
                  among them. The title-block badge above stays read-only. */}
              <span className="flex items-center justify-end gap-2">
                <Select
                  value={milestone.status}
                  disabled={statusMutation.isPending || titleMutation.isPending}
                  onValueChange={(value) => handleStatusChange(value, titleMutation.isPending)}
                >
                  <SelectTrigger
                    aria-label="Status"
                    value={milestone.status}
                    className={`${selectClassName} h-8 px-2 py-1`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusError !== null && (
                  <span className="text-sm text-accent-danger">{statusError}</span>
                )}
              </span>
            </FieldRow>
            {/* Managed System is create-only (A3/A8): read-only text, never an input. */}
            <FieldRow label="Managed System" className={milestonePropertyFieldClassName}>
              <MilestoneManagedSystemPill name={managedSystemName} />
            </FieldRow>
            <FieldRow label="Analytics Area" className={milestonePropertyFieldClassName}>
              {areaName !== undefined ? (
                <MilestoneOutlineBadge>{areaName}</MilestoneOutlineBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            {/* Owner per finding 4: the prototype renders a UserChip here
                (screen-milestones.jsx Properties) — the milestone-local chip
                keeps avatar + display name at the prototype 18px/9px avatar
                geometry; an actor missing from the directory keeps the
                explicit — fallback (missing-actor handling preserved). */}
            <FieldRow label="Owner" className={milestonePropertyFieldClassName}>
              {ownerName !== undefined ? (
                <MilestoneOwnerChip name={ownerName} />
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Start" className={milestonePropertyFieldClassName}>
              <span className="font-mono text-xs text-text-secondary">
                {formatDateOnly(milestone.start_date)}
              </span>
            </FieldRow>
            <FieldRow label="Target" className={milestonePropertyFieldClassName}>
              <span className="font-mono text-xs text-text-secondary">
                {formatDateOnly(milestone.target_date)}
              </span>
            </FieldRow>
            <FieldRow label="Created" className={milestonePropertyFieldClassName}>
              {formatDate(milestone.created_at)}
            </FieldRow>
          </div>
        </div>

        {/* #514 B2d-tasks — flat child Task list (screen-milestones.jsx:402-416).
            The prototype's Add task action has no #514 writer behind it, so the
            section ships read-only; assign/unassign lives on the Task detail. */}
        <div data-anchor="tasks" className="mb-8">
          <MilestonePanelSectionTitle>
            {childTasks === undefined ? 'Tasks' : `Tasks · ${childTasks.length}`}
          </MilestonePanelSectionTitle>
          {childTasksQuery.error !== null ? (
            isPermissionDenied(childTasksQuery.error) ? (
              // B2d fixup F1 — a denied child-list read is the permission
              // contract, not an outage: the same classification as the
              // milestone read and TaskListRoute drives the blocked panel
              // with domain-safe copy.
              <PermissionBlockedPanel
                state="denied"
                category="Task list"
                reason={PERMISSION_BLOCKED_REASONS.milestoneTasks}
              />
            ) : (
              // Same terminal copy as the Tasks list route (TaskListRoute).
              <div className="py-3 text-center text-xs text-text-muted">Task list unavailable.</div>
            )
          ) : childTasks !== undefined && childTasks.length === 0 ? (
            <div className="py-3 text-center text-xs text-text-muted">
              아직 연결된 Task 가 없습니다.
            </div>
          ) : childTasks !== undefined ? (
            <div className="flex flex-col gap-1.5">
              {childTasks.map((task) => (
                <MilestoneTaskRow
                  key={task.id}
                  task={task}
                  // B2d fixup F2 — a non-null assignee id missing from the
                  // directory (lookup pending or failed) keeps the explicit
                  // '담당자 지정됨' fallback from the Task list/detail; the avatar
                  // slot renders it until the name resolves.
                  assigneeName={
                    task.assignee_actor_id !== null
                      ? (actorNamesById.get(task.assignee_actor_id) ?? '담당자 지정됨')
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </div>

        <div data-anchor="evidence" className="mb-8 last:mb-0">
          <MilestonePanelSectionTitle>Evidence</MilestonePanelSectionTitle>
          {/* No evidence read path in these slices (manual linking is §7 item 14);
              empty copy only — no Outcome survey controls (FOP-OUT-014). */}
          <div className="py-3 text-center text-xs text-text-muted">
            연결된 evidence highlight 가 없습니다.
          </div>
        </div>

        <div data-anchor="activity" className="last:mb-0">
          <MilestonePanelSectionTitle>이력</MilestonePanelSectionTitle>
          {/* No audit_log read path exists (§7 item 9); the empty copy ships. */}
          <div className="py-3 text-center text-xs text-text-muted">활동 기록이 없습니다.</div>
        </div>
      </div>
    </>
  );
}
