import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import { ObjectRow, type ObjectRowSeverity } from '@fops/ui';
import { formatDate } from './predicates';

export const STATUS_LABELS: Record<TaskRequestStatus, string> = {
  pending_review: 'Pending',
  needs_more_evidence: 'Needs evidence',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted',
};

const STATUS_CLASS: Record<TaskRequestStatus, string> = {
  pending_review: 'border-accent-warn/30 bg-accent-warn/10 text-accent-warn',
  needs_more_evidence: 'border-accent-info/30 bg-accent-info/10 text-accent-info',
  approved: 'border-accent-success/30 bg-accent-success/10 text-accent-success',
  rejected: 'border-accent-danger/30 bg-accent-danger/10 text-accent-danger',
  converted: 'border-border-subtle bg-surface-raised text-text-muted',
};

export const STATUS_SEVERITY: Record<TaskRequestStatus, ObjectRowSeverity> = {
  pending_review: 'high',
  needs_more_evidence: 'medium',
  approved: 'low',
  rejected: 'critical',
  converted: 'low',
};

export function TaskRequestBadge({ status }: { status: TaskRequestStatus }) {
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export interface NameMaps {
  actorsById: Record<string, { id: string; display_name: string; email?: string }>;
  managedSystemsById: Record<string, { name: string }>;
}

// `exactOptionalPropertyTypes` is on: an optional property must spell `| undefined`
// explicitly for a value that may actually be undefined to be assignable.
export type TaskRequestListItem = TaskRequestDto & {
  source?: (NonNullable<TaskRequestDto['source']> & { display_id?: string | null }) | undefined;
};

interface TaskRequestRowProps {
  item: TaskRequestListItem;
  selected: boolean;
  names: NameMaps;
  onSelect: (id: string) => void;
}

function sourceDisplayId(item: TaskRequestListItem): string {
  return item.source?.display_id?.trim() ? item.source.display_id : shortId(item.source_id);
}

export function TaskRequestRow({ item, selected, names, onSelect }: TaskRequestRowProps) {
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;
  const ms = names.managedSystemsById[item.primary_managed_system_id];

  return (
    <ObjectRow
      id={item.display_id}
      title={item.requested_outcome}
      severity={STATUS_SEVERITY[item.status]}
      selected={selected}
      density="default"
      onClick={() => onSelect(item.id)}
      badges={<TaskRequestBadge status={item.status} />}
      meta={
        <>
          {item.source_type === 'finding' && (
            <span className="font-mono text-accent-info">↔ {sourceDisplayId(item)}</span>
          )}
          {dot()}
          <span>Evidence 1</span>
          {dot()}
          <span>{ms?.name ?? shortId(item.primary_managed_system_id)}</span>
          {dot()}
          <span>{formatDate(item.created_at)}</span>
        </>
      }
      trailing={
        <>
          <span className="text-xs text-text-muted">by {requester?.display_name ?? 'Unknown'}</span>
          {reviewer ? (
            <span className="rounded border border-border-subtle px-2 py-1 text-xs text-text-muted">
              {reviewer.display_name}
            </span>
          ) : (
            <span className="rounded border border-accent-danger/30 px-2 py-1 text-xs text-accent-danger">
              No reviewer
            </span>
          )}
        </>
      }
    />
  );
}
