import { TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { formatDateOnly, formatRelativeTime } from '@/lib/format/datetime';
import type { EntityLinkDto, TaskReporterSummary, TaskStatus } from '@fops/shared';
import {
  LinkedEntityTrail,
  OutlineBadge,
  PanelSectionTitle,
  PermissionBlockedPanel,
} from '@fops/ui';
import type * as React from 'react';

export interface LinkedEntityTrailSectionProps {
  /** Backend-decided link DTOs included with the VOC detail read model. */
  links?: EntityLinkDto[];
  /** A Reporter may consume only summary_visible.summary, never an allowed Task DTO. */
  isReporterContext: boolean;
  /**
   * Opens the linked Task. Injected rather than taken from `useNavigate` so this
   * stays a presentational component its tests can render without a router.
   * Omitted means the trail renders as plain text, which is the correct
   * fallback for any surface with nowhere to send the actor.
   */
  onOpenTask?: ((taskId: string) => void) | undefined;
  /** Opens the linked Finding; same plain-text fallback rule as `onOpenTask` (#1174b). */
  onOpenFinding?: ((findingId: string) => void) | undefined;
}

function isTaskLink(link: EntityLinkDto): boolean {
  return link.source_type === 'task' || link.target_type === 'task';
}

function isFindingLink(link: EntityLinkDto): boolean {
  return link.source_type === 'finding' || link.target_type === 'finding';
}

/**
 * True when this trail renders the Finding link for the current actor (#1174b).
 * `allowed` counts outside Reporter context, `denied` counts everywhere it is
 * emitted; `hidden` and the unreachable Finding `summary_visible` payload do not.
 */
export function isVisibleFindingLink(link: EntityLinkDto, isReporterContext: boolean): boolean {
  if (!isFindingLink(link)) return false;
  if (link.visibility_state === 'denied') return true;
  return link.visibility_state === 'allowed' && !isReporterContext;
}

function ReporterTaskSummary({
  summary,
}: {
  summary: TaskReporterSummary;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2" data-testid="linked-task-summary">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-primary">{summary.public_title}</span>
        <OutlineBadge>{summary.reporter_facing_status}</OutlineBadge>
      </div>
      {(summary.owning_team_public_name !== undefined ||
        summary.expected_resolution_date !== undefined ||
        summary.last_public_update_at !== undefined ||
        summary.public_update_excerpt !== undefined) && (
        <dl className="flex flex-col gap-1 text-xs text-text-secondary">
          {summary.owning_team_public_name !== undefined && (
            <div className="flex gap-2">
              <dt>담당 팀</dt>
              <dd>{summary.owning_team_public_name}</dd>
            </div>
          )}
          {summary.expected_resolution_date !== undefined && (
            <div className="flex gap-2">
              <dt>예상 해결일</dt>
              <dd>{formatDateOnly(summary.expected_resolution_date)}</dd>
            </div>
          )}
          {summary.last_public_update_at !== undefined && (
            <div className="flex gap-2">
              <dt>최근 공개 업데이트</dt>
              <dd>{formatRelativeTime(summary.last_public_update_at)}</dd>
            </div>
          )}
          {summary.public_update_excerpt !== undefined && <dd>{summary.public_update_excerpt}</dd>}
        </dl>
      )}
    </div>
  );
}

function SafeTaskLink({
  state,
}: {
  state: 'denied';
}): React.ReactElement {
  // ADR-0023 §A/§E: denied may acknowledge only a safe category.
  return (
    <div data-testid={`linked-task-${state}`}>
      <PermissionBlockedPanel state="denied" category="연결된 Task" />
    </div>
  );
}

function AllowedTaskLink({
  link,
  isReporterContext,
  onOpenTask,
}: {
  link: Extract<EntityLinkDto, { visibility_state: 'allowed' }>;
  isReporterContext: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
}): React.ReactElement | null {
  if (isReporterContext) return null;

  const task = link.target_summary?.type === 'task' ? link.target_summary : null;
  if (task === null) return null;

  const openTask = onOpenTask;
  return (
    <div data-testid="linked-task-allowed">
      <LinkedEntityTrail
        nodes={[
          {
            type: 'task',
            id: task.id,
            display_id: task.display_id,
            title: task.title,
            // Shared English workflow label (ADR-0057 A2); a target_summary status
            // is an unparsed string, so fall back to it only if it leaves the enum.
            meta: TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status,
            // `allowed` already means the backend decided this actor may read
            // the Task, so naming it without a way there is a dead end. Only
            // this state gets a destination — summary_visible and denied must
            // stay unnavigable (ADR-0023 §A/§E), and Reporter context returned
            // above before reaching here.
            ...(openTask ? { onNavigate: () => openTask(task.id) } : {}),
          },
        ]}
      />
    </div>
  );
}

function TaskLink({
  link,
  isReporterContext,
  onOpenTask,
}: {
  link: EntityLinkDto;
  isReporterContext: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
}): React.ReactElement | null {
  switch (link.visibility_state) {
    case 'summary_visible':
      // FR-LINK-002: render only this backend-provided payload; never synthesize a summary.
      return (
        <PermissionBlockedPanel
          state="summary_visible"
          category="연결된 Task"
          summary={<ReporterTaskSummary summary={link.summary} />}
        />
      );
    case 'allowed':
      return (
        <AllowedTaskLink
          link={link}
          isReporterContext={isReporterContext}
          onOpenTask={onOpenTask}
        />
      );
    case 'hidden':
      // ADR-0023 §A: do not acknowledge that this link exists.
      return null;
    case 'denied':
      return <SafeTaskLink state="denied" />;
  }
}

function SafeFindingLink(): React.ReactElement {
  // ADR-0023 §A/§E: denied may acknowledge only a safe category.
  return (
    <div data-testid="linked-finding-denied">
      <PermissionBlockedPanel state="denied" category="연결된 Finding" />
    </div>
  );
}

function AllowedFindingLink({
  link,
  isReporterContext,
  onOpenFinding,
}: {
  link: Extract<EntityLinkDto, { visibility_state: 'allowed' }>;
  isReporterContext: boolean;
  onOpenFinding?: ((findingId: string) => void) | undefined;
}): React.ReactElement | null {
  if (isReporterContext) return null;

  const finding = link.target_summary?.type === 'finding' ? link.target_summary : null;
  if (finding === null) return null;

  const openFinding = onOpenFinding;
  return (
    <div data-testid="linked-finding-allowed">
      <LinkedEntityTrail
        nodes={[
          {
            type: 'finding',
            id: finding.id,
            display_id: finding.display_id,
            title: finding.title,
            meta: finding.display_id,
            // `allowed` already means the backend decided this actor may read the
            // Finding, so naming it without a way there is a dead end. Only this
            // state gets a destination — summary_visible and denied must stay
            // unnavigable (ADR-0023 §A/§E, ADR-0024 §D), and Reporter context
            // returned above before reaching here.
            ...(openFinding ? { onNavigate: () => openFinding(finding.id) } : {}),
          },
        ]}
      />
    </div>
  );
}

function FindingLink({
  link,
  isReporterContext,
  onOpenFinding,
}: {
  link: EntityLinkDto;
  isReporterContext: boolean;
  onOpenFinding?: ((findingId: string) => void) | undefined;
}): React.ReactElement | null {
  switch (link.visibility_state) {
    case 'summary_visible':
      // ADR-0024 §E: a Finding has no reporter summary, so this payload is
      // inconsistent — fail closed and conceal the row.
      return null;
    case 'allowed':
      return (
        <AllowedFindingLink
          link={link}
          isReporterContext={isReporterContext}
          onOpenFinding={onOpenFinding}
        />
      );
    case 'hidden':
      // ADR-0023 §A: do not acknowledge that this link exists.
      return null;
    case 'denied':
      return <SafeFindingLink />;
  }
}

export function LinkedEntityTrailSection({
  links = [],
  isReporterContext,
  onOpenTask,
  onOpenFinding,
}: LinkedEntityTrailSectionProps): React.ReactElement {
  const trailLinks = links.filter((link) => {
    // #1174b: a Finding `summary_visible` payload is inconsistent (ADR-0024 §E);
    // treat it exactly like `hidden`.
    if (isFindingLink(link) && link.visibility_state === 'summary_visible') return false;
    return (
      (isTaskLink(link) || isFindingLink(link)) &&
      link.visibility_state !== 'hidden' &&
      !(isReporterContext && link.visibility_state === 'allowed')
    );
  });

  if (trailLinks.length === 0) return <></>;

  return (
    <div>
      <PanelSectionTitle>관련 엔티티</PanelSectionTitle>
      {trailLinks.map((link) =>
        isFindingLink(link) ? (
          <FindingLink
            key={link.id}
            link={link}
            isReporterContext={isReporterContext}
            onOpenFinding={onOpenFinding}
          />
        ) : (
          <TaskLink
            key={link.id}
            link={link}
            isReporterContext={isReporterContext}
            onOpenTask={onOpenTask}
          />
        ),
      )}
    </div>
  );
}
