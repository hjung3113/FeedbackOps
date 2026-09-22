// ProgressNoteEntry — one progress-note timeline row (#377).
//
// Row anatomy mirrors the VOC TimelineEntry rhythm (actor chip + time, kind
// badge, rich body) but is a dedicated component: ConversationTimeline/TimelineEntry
// are bound to VOC public/internal tabs and VOC kind labels, and the
// status_change row carries from → to status badges that VOC entries don't have.
//
// Status badges are rendered by the consumer through renderStatusBadge — the
// Finding panel passes FitBadge + its Korean status labels, the Task panel
// passes InternalTaskBadge (which owns its own labels). Status vocabulary stays
// on the owning surface instead of being duplicated here.

import { isTipTapDocBlank } from '@fops/shared';
import type { FindingStatus, TaskStatus } from '@fops/shared';
import { OutlineBadge, RichContentRenderer, type TipTapDoc, UserChip } from '@fops/ui';
import type * as React from 'react';
import type { ProgressNoteDto } from './useProgressNotes';

export type RenderStatusBadge =
  | ((status: FindingStatus | TaskStatus) => React.ReactNode)
  | undefined;

export interface ProgressNoteEntryProps {
  entry: ProgressNoteDto;
  kindBadgeLabel: string;
  actorFallbackName: string;
  actorDisplayName?: string | undefined;
  renderStatusBadge: RenderStatusBadge;
  isLast: boolean;
}

// The server sanitizes every stored body through the TipTap pipeline, but a
// status_change row created without a reason stores a blank doc — render only
// bodies with actual content.
function hasBody(doc: unknown): boolean {
  return doc !== null && doc !== undefined && !isTipTapDocBlank(doc as TipTapDoc);
}

export function ProgressNoteEntry({
  entry,
  kindBadgeLabel,
  actorFallbackName,
  actorDisplayName,
  renderStatusBadge,
  isLast,
}: ProgressNoteEntryProps): React.ReactElement {
  const actor: { display_name: string } = { display_name: actorFallbackName };
  if (actorDisplayName !== undefined) {
    actor.display_name = actorDisplayName;
  }

  return (
    <div
      className={`flex flex-col gap-1 border-b border-border-subtle py-2${isLast ? ' border-b-0' : ''}`}
      data-testid="progress-note-entry"
    >
      {/* Top row: actor chip + kind badge */}
      <div className="flex items-center justify-between gap-2">
        <UserChip user={actor} size="sm" sub={formatCreatedAt(entry.created_at)} />
        <OutlineBadge>{kindBadgeLabel}</OutlineBadge>
      </div>

      {/* status_change transition pair — badges come from the owning surface */}
      {entry.kind === 'status_change' &&
        entry.from_status !== null &&
        entry.to_status !== null &&
        renderStatusBadge !== undefined && (
          <div className="mt-1 flex items-center gap-2 pl-8">
            {renderStatusBadge(entry.from_status)}
            <span className="text-xs text-text-muted">→</span>
            {renderStatusBadge(entry.to_status)}
          </div>
        )}

      {/* Rich body — internal mode keeps mention nodes renderable */}
      {hasBody(entry.body_rich_content) && (
        <div className="pl-8">
          <RichContentRenderer doc={entry.body_rich_content as TipTapDoc} mode="internal" />
        </div>
      )}
    </div>
  );
}

// Compact absolute timestamp — same shape as the Task panel's row meta clock.
// (Relative time would need the visual harness's fixed-clock pin; absolute
// dates keep the timeline unambiguous across pages.)
function formatCreatedAt(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(raw));
}
