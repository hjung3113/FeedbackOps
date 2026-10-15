import { assignTaskRequestReviewer } from '@/lib/api/task-requests';
import { GLOSSARY } from '@/lib/copy/glossary';
import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { shortId } from '@/lib/identity';
import type { TaskRequestDto } from '@fops/shared';
import {
  FieldRow,
  ManagedSystemPill,
  PanelSectionTitle,
  UnassignedBadge,
  UserChip,
} from '@fops/ui';
import { ResponsibilityEditor } from '../../components/ResponsibilityEditor';

import type { NameMaps } from './TaskRequestRow';

export function TaskRequestPropertiesSection({
  item,
  names,
  reviewer,
  canAssign,
}: {
  canAssign?: boolean;
  item: TaskRequestDto;
  names: NameMaps;
  reviewer: NameMaps['actorsById'][string] | undefined;
}) {
  return (
    <section data-anchor="properties" className="border-t border-border-subtle px-4 py-4">
      <PanelSectionTitle>속성</PanelSectionTitle>
      <FieldRow label="Managed System">
        <span className="flex flex-col gap-1">
          <ManagedSystemPill
            name={
              names.managedSystemsById[item.primary_managed_system_id]?.name ?? 'Managed System'
            }
          />
          {!names.managedSystemsById[item.primary_managed_system_id] && (
            <span className="font-mono text-xs text-text-muted">
              {shortId(item.primary_managed_system_id)}
            </span>
          )}
        </span>
      </FieldRow>
      <FieldRow label={RESPONSIBILITY_COPY.reviewer}>
        {canAssign !== undefined ? (
          <ResponsibilityEditor
            key={item.id}
            label={RESPONSIBILITY_COPY.reviewer}
            actorId={item.assigned_reviewer_actor_id}
            teamId={item.assigned_reviewer_team_id}
            canEdit={canAssign}
            teamCandidates={[
              ...new Set(
                [
                  names.managedSystemsById[item.primary_managed_system_id]?.defaultReviewerTeamId,
                  names.managedSystemsById[item.primary_managed_system_id]?.defaultOwnerTeamId,
                ].filter((id): id is string => id !== undefined),
              ),
            ]}
            onSave={(actorId, teamId, key) =>
              assignTaskRequestReviewer(
                item.id,
                {
                  assigned_reviewer_actor_id: actorId,
                  assigned_reviewer_team_id: teamId,
                },
                key,
              )
            }
          />
        ) : (
          <span>
            {item.assigned_reviewer_actor_id
              ? (names.actorsById[item.assigned_reviewer_actor_id]?.display_name ??
                GLOSSARY.unknownUser)
              : item.assigned_reviewer_team_id
                ? `팀 ${shortId(item.assigned_reviewer_team_id)}`
                : '미배정'}
          </span>
        )}
      </FieldRow>
      <FieldRow label={RESPONSIBILITY_COPY.decider}>
        {reviewer ? (
          <UserChip
            user={{ display_name: reviewer.display_name }}
            {...(reviewer.email !== undefined ? { sub: reviewer.email } : {})}
          />
        ) : item.assigned_reviewer_actor_id || item.assigned_reviewer_team_id ? (
          <span className="rounded border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
            {RESPONSIBILITY_COPY.undecided}
          </span>
        ) : (
          <UnassignedBadge label="검토자 없음" />
        )}
      </FieldRow>
      <FieldRow label="본인 승인">
        <span className="rounded border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
          {item.status === 'approved' || item.status === 'converted'
            ? item.reviewer_actor_id === item.requester_actor_id
              ? TASK_REQUEST_COPY.selfApproved
              : TASK_REQUEST_COPY.peerApproved
            : TASK_REQUEST_COPY.notApproved}
        </span>
      </FieldRow>
    </section>
  );
}
