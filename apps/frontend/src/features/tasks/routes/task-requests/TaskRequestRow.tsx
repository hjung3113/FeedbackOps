import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import { ObjectRow } from '@fops/ui';

import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';

import { formatDate } from './predicates';

const STATUS_CLASS: Record<TaskRequestStatus, string> = {
  pending_review: 'border-accent-warn/30 bg-accent-warn/10 text-accent-warn',
  needs_more_evidence: 'border-accent-info/30 bg-accent-info/10 text-accent-info',
  approved: 'border-accent-success/30 bg-accent-success/10 text-accent-success',
  rejected: 'border-accent-danger/30 bg-accent-danger/10 text-accent-danger',
  converted: 'border-border-subtle bg-surface-raised text-text-muted',
};

export function TaskRequestBadge({ status }: { status: TaskRequestStatus }) {
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {TASK_REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

export function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

export interface NameMaps {
  actorsById: Record<string, { id: string; display_name: string; email?: string }>;
  managedSystemsById: Record<string, { name: string }>;
}

// `exactOptionalPropertyTypes` is on: an optional property must spell `| undefined`
// explicitly for a value that may actually be undefined to be assignable.
export type TaskRequestListItem = TaskRequestDto;

interface TaskRequestRowProps {
  item: TaskRequestListItem;
  selected: boolean;
  names: NameMaps;
  onSelect: (id: string) => void;
}

function sourceDisplayId(item: TaskRequestListItem): string {
  return item.source?.display_id?.trim() ? item.source.display_id : 'Finding';
}

export function TaskRequestRow({ item, selected, names, onSelect }: TaskRequestRowProps) {
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;
  const ms = names.managedSystemsById[item.primary_managed_system_id];
  const showsSourceId = item.source_type === 'finding';
  const evidenceCount = item.source?.evidence_count;

  return (
    <ObjectRow
      id={item.display_id}
      title={item.requested_outcome}
      selected={selected}
      density="default"
      onClick={() => onSelect(item.id)}
      badges={<TaskRequestBadge status={item.status} />}
      meta={
        <>
          {showsSourceId && (
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-accent-info">↔ {sourceDisplayId(item)}</span>
            </span>
          )}
          {evidenceCount !== undefined && (
            <>
              {showsSourceId && dot()}
              <span>Evidence · {evidenceCount}</span>
            </>
          )}
          {(showsSourceId || evidenceCount !== undefined) && dot()}
          <span>{ms?.name ?? 'Managed System'}</span>
          {!ms && (
            <span className="font-mono text-text-muted">
              {shortId(item.primary_managed_system_id)}
            </span>
          )}
          {dot()}
          <span>{formatDate(item.created_at)}</span>
        </>
      }
      trailing={
        <>
          <span className="text-xs text-text-muted">
            by <span>{requester?.display_name ?? '알 수 없는 사용자'}</span>
            {!requester && (
              <span className="block font-mono text-text-muted">
                {shortId(item.requester_actor_id)}
              </span>
            )}
          </span>
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
