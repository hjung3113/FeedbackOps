import type { EntityLinkDto } from '@fops/shared';
import { EntityIconBadge, cn, type EntityIconType } from '@fops/ui';
import { ArrowRight, Lock } from 'lucide-react';

function shortId(id: string): string {
  return id.slice(0, 8);
}

function iconTypeFor(type: EntityLinkDto['source_type']): EntityIconType {
  if (type === 'task_request') return 'request';
  if (type === 'voc_cluster') return 'voc';
  return type;
}

export function EntityRelationRow({
  link,
  compact = false,
}: {
  link: EntityLinkDto;
  compact?: boolean;
}) {
  if (link.visibility_state !== 'allowed') {
    return (
      <div className="inline-flex min-w-0 items-center gap-2 bg-transparent">
        <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-blocked px-2 py-0.5 text-xs font-medium text-text-muted">
          <Lock className="h-3 w-3" aria-hidden="true" />
          권한 제한
        </span>
        <span className="font-mono text-xs text-text-muted">{link.relation_type}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex min-w-0 flex-wrap items-center gap-2 bg-transparent',
        compact && 'gap-1.5',
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.source_type)} size={18} />
        <span className="font-mono text-xs text-text-primary">{shortId(link.source_id)}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-text-muted">
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
        {link.relation_type}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <EntityIconBadge type={iconTypeFor(link.target_type)} size={18} />
        <span className="font-mono text-xs text-text-primary">{shortId(link.target_id)}</span>
      </span>
    </div>
  );
}
