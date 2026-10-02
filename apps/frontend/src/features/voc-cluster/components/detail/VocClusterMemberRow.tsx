import { FINDING_SEVERITY_LABELS } from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';
import { Button, ReporterStatusBadge, cn } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import type * as React from 'react';
import type { VocClusterMemberPresentation } from '../types';

function memberDisplay(member: VocClusterMemberPresentation): {
  primary: string;
  secondary: string | null;
} {
  if (member.title?.trim()) {
    return {
      primary: member.title,
      secondary: member.display_id?.trim() ? member.display_id : shortId(member.voc_id),
    };
  }
  if (member.display_id?.trim()) {
    return { primary: member.display_id, secondary: shortId(member.voc_id) };
  }
  return { primary: 'VOC', secondary: shortId(member.voc_id) };
}

export function VocClusterMemberRow({
  member,
  last,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: VocClusterMemberPresentation;
  last: boolean;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}): React.ReactElement {
  const display = memberDisplay(member);
  const reporterStatus = member.reporter_facing_status as
    | Parameters<typeof ReporterStatusBadge>[0]['status']
    | undefined;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5',
        !last && 'border-b border-border-subtle',
      )}
      data-testid={`cluster-member-row-${member.voc_id}`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm text-text-primary">
          <Link
            to="/vocs"
            search={{ view: 'inbox', selected: member.voc_id }}
            className="text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
            data-testid={`cluster-member-link-${member.voc_id}`}
          >
            {display.primary}
          </Link>
        </div>
        <p className="text-xs text-text-muted">
          {display.secondary ?? shortId(member.voc_id)}
          {member.severity ? ` · ${FINDING_SEVERITY_LABELS[member.severity]}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {reporterStatus && <ReporterStatusBadge status={reporterStatus} />}
        {canRemove ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
            data-testid={`cluster-member-remove-${member.voc_id}`}
            aria-label="VOC 제거"
          >
            <Trash2 className="h-3.5 w-3.5 text-text-muted" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
