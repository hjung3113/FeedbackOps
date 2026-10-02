import type { TaskRequestDto, TaskRequestStatus } from '@fops/shared';
import { ObjectRow, UnassignedBadge } from '@fops/ui';
import { Fragment, type ReactNode } from 'react';

import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { formatShortDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';

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
  const metaParts: Array<{ key: string; node: ReactNode }> = [];

  if (showsSourceId) {
    metaParts.push({
      key: 'source',
      node: (
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-accent-info">↔ {sourceDisplayId(item)}</span>
        </span>
      ),
    });
  }
  if (evidenceCount !== undefined) {
    metaParts.push({ key: 'evidence-count', node: <span>Evidence · {evidenceCount}</span> });
  }
  metaParts.push({
    key: 'managed-system',
    node: (
      <>
        <span>{ms?.name ?? 'Managed System'}</span>
        {!ms && (
          <span className="font-mono text-text-muted">
            {shortId(item.primary_managed_system_id)}
          </span>
        )}
      </>
    ),
  });
  if (item.created_at) {
    metaParts.push({
      key: 'created-at',
      node: <span>{formatShortDateTime(item.created_at)}</span>,
    });
  }
  const sourceTitle = item.source?.title?.trim() ? item.source.title : null;

  return (
    <ObjectRow
      id={item.display_id}
      title={
        sourceTitle ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{sourceTitle}</span>
            <span className="truncate text-xs font-normal text-text-muted">
              {item.requested_outcome}
            </span>
          </span>
        ) : (
          item.requested_outcome
        )
      }
      selected={selected}
      density="default"
      onClick={() => onSelect(item.id)}
      badges={<TaskRequestBadge status={item.status} />}
      meta={metaParts.map(({ key, node }, index) => (
        <Fragment key={key}>
          {index > 0 && dot()}
          {node}
        </Fragment>
      ))}
      trailing={
        <>
          <span className="text-xs text-text-muted">
            요청자 <span>{requester?.display_name ?? GLOSSARY.unknownUser}</span>
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
            <UnassignedBadge label="검토자 없음" />
          )}
        </>
      }
    />
  );
}
