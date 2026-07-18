import * as React from 'react';
import type { EntityLinkDto, TaskReporterSummary } from '@fops/shared';
import {
  LinkedEntityTrail,
  OutlineBadge,
  PanelSectionTitle,
  PermissionBlockedPanel,
} from '@fops/ui';

export interface LinkedEntityTrailSectionProps {
  /** Backend-decided link DTOs included with the VOC detail read model. */
  links?: EntityLinkDto[];
  /** A Reporter may consume only summary_visible.summary, never an allowed Task DTO. */
  isReporterContext: boolean;
}

function isTaskLink(link: EntityLinkDto): boolean {
  return link.source_type === 'task' || link.target_type === 'task';
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
              <dd>{summary.expected_resolution_date}</dd>
            </div>
          )}
          {summary.last_public_update_at !== undefined && (
            <div className="flex gap-2">
              <dt>최근 공개 업데이트</dt>
              <dd>{summary.last_public_update_at}</dd>
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
}: {
  link: Extract<EntityLinkDto, { visibility_state: 'allowed' }>;
  isReporterContext: boolean;
}): React.ReactElement | null {
  if (isReporterContext) return null;

  const task = link.target_summary?.type === 'task' ? link.target_summary : null;
  if (task === null) return null;

  return (
    <div data-testid="linked-task-allowed">
      <LinkedEntityTrail
        nodes={[
          {
            type: 'task',
            id: task.id,
            display_id: task.display_id,
            title: task.title,
            meta: task.status,
          },
        ]}
      />
    </div>
  );
}

function TaskLink({
  link,
  isReporterContext,
}: {
  link: EntityLinkDto;
  isReporterContext: boolean;
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
      return <AllowedTaskLink link={link} isReporterContext={isReporterContext} />;
    case 'hidden':
      // ADR-0023 §A: do not acknowledge that this link exists.
      return null;
    case 'denied':
      return <SafeTaskLink state="denied" />;
  }
}

export function LinkedEntityTrailSection({
  links = [],
  isReporterContext,
}: LinkedEntityTrailSectionProps): React.ReactElement {
  const taskLinks = links.filter(
    (link) =>
      isTaskLink(link) &&
      link.visibility_state !== 'hidden' &&
      !(isReporterContext && link.visibility_state === 'allowed'),
  );

  if (taskLinks.length === 0) return <></>;

  return (
    <div>
      <PanelSectionTitle>관련 엔티티</PanelSectionTitle>
      {taskLinks.map((link) => (
        <TaskLink key={link.id} link={link} isReporterContext={isReporterContext} />
      ))}
    </div>
  );
}
