import type { EntityLinkDto } from '@fops/shared';
import { EntityIconBadge, type EntityIconType, cn } from '@fops/ui';
import { ArrowRight, Lock } from 'lucide-react';

import { ENTITY_LINK_RELATION_LABELS } from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';

type AllowedEntityLinkDto = Extract<EntityLinkDto, { visibility_state: 'allowed' }>;

const ENTITY_TYPE_LABEL: Record<EntityLinkDto['source_type'], string> = {
  voc: 'VOC',
  survey_response: 'Survey 응답',
  finding: 'Finding',
  voc_cluster: 'VOC Cluster',
  task_request: 'Task Request',
  task: 'Task',
};

function endpointIdentity(
  type: EntityLinkDto['source_type'],
  id: string,
  summary: AllowedEntityLinkDto['source_summary'],
): { label: string; displayId: boolean } {
  if (summary?.type === type && summary.id === id) {
    return { label: summary.display_id, displayId: true };
  }
  return { label: ENTITY_TYPE_LABEL[type], displayId: false };
}

export function entityLinkEndpointPrimaryLabels(link: EntityLinkDto): [string, string] {
  if (link.visibility_state !== 'allowed') {
    return ['접근할 수 없는 항목', '접근할 수 없는 항목'];
  }
  return [
    endpointIdentity(link.source_type, link.source_id, link.source_summary).label,
    endpointIdentity(link.target_type, link.target_id, link.target_summary).label,
  ];
}

function iconTypeFor(type: EntityLinkDto['source_type']): EntityIconType {
  if (type === 'task_request') return 'request';
  if (type === 'voc_cluster') return 'voc';
  if (type === 'survey_response') return 'survey';
  return type;
}

export function EntityRelationRow({
  link,
  compact = false,
  className,
  testId,
}: {
  link: EntityLinkDto;
  compact?: boolean;
  className?: string;
  testId?: string;
}) {
  if (link.visibility_state !== 'allowed') {
    return (
      <div
        className={cn('inline-flex min-w-0 items-center gap-2 bg-transparent', className)}
        data-testid={testId}
      >
        <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-blocked px-2 py-0.5 text-xs font-medium text-text-muted">
          <Lock className="h-3 w-3" aria-hidden="true" />
          권한 제한
        </span>
        <span className="text-xs text-text-muted">접근할 수 없는 항목</span>
        <span className="font-mono text-xs text-text-muted">
          {ENTITY_LINK_RELATION_LABELS[link.relation_type]}
        </span>
      </div>
    );
  }

  const source = endpointIdentity(link.source_type, link.source_id, link.source_summary);
  const target = endpointIdentity(link.target_type, link.target_id, link.target_summary);

  return (
    <div
      className={cn(
        'inline-flex min-w-0 flex-wrap items-center gap-2 bg-transparent',
        compact && 'gap-1.5',
        className,
      )}
      data-testid={testId}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.source_type)} size={18} />
        <span
          className={
            source.displayId
              ? 'font-mono text-xs text-text-primary'
              : 'text-xs font-medium text-text-primary'
          }
        >
          {source.label}
        </span>
        {!source.displayId && (
          <span className="font-mono text-xs text-text-muted">{shortId(link.source_id)}</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
        {ENTITY_LINK_RELATION_LABELS[link.relation_type]}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.target_type)} size={18} />
        <span
          className={
            target.displayId
              ? 'font-mono text-xs text-text-primary'
              : 'text-xs font-medium text-text-primary'
          }
        >
          {target.label}
        </span>
        {!target.displayId && (
          <span className="font-mono text-xs text-text-muted">{shortId(link.target_id)}</span>
        )}
      </span>
    </div>
  );
}
