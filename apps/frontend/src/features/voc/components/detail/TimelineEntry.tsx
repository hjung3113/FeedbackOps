// TimelineEntry — single conversation entry with kind chip + rich body.

import * as React from 'react';
import type { ConversationEntry } from '@fops/shared';
import {
  UserChip,
  OutlineBadge,
  RichContentRenderer,
  ReporterStatusBadge,
  type ReporterFacingStatusEnum,
  type TipTapDoc,
} from '@fops/ui';
import { useMe } from '@/lib/auth/useMe';
import { formatVocCreatedAt } from '@/features/voc/components/list/VocRow';

// ── Korean labels ────────────────────────────────────────────────────────────

const KIND_LABELS: Record<ConversationEntry['kind'], string> = {
  public_update:     '공개 업데이트',
  reporter_reply:    'Reporter 답변',
  internal_comment:  '내부 코멘트',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface TimelineEntryProps {
  entry: ConversationEntry;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TimelineEntry({ entry }: TimelineEntryProps): React.ReactElement {
  const { data: me } = useMe();

  const actorUser: { display_name: string } =
    me?.actor.id === entry.actor_id
      ? { display_name: me.actor.display_name }
      : { display_name: `Actor ${entry.actor_id.slice(0, 8)}` };

  const rendererMode =
    entry.kind === 'internal_comment' ? 'internal' : 'reporter_visible';

  const hasStatusTransition =
    entry.kind === 'public_update' &&
    typeof entry.reporter_facing_status_before === 'string' &&
    typeof entry.reporter_facing_status_after === 'string';

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border-subtle last:border-b-0">
      {/* Top row: actor chip + kind badge */}
      <div className="flex items-center justify-between gap-2">
        <UserChip
          user={actorUser}
          size="sm"
          sub={formatVocCreatedAt(entry.created_at)}
        />
        <OutlineBadge>{KIND_LABELS[entry.kind]}</OutlineBadge>
      </div>

      {/* Rich body */}
      <div className="pl-8">
        <RichContentRenderer doc={entry.body_rich_content as TipTapDoc} mode={rendererMode} />
      </div>

      {/* Status transition pair (public_update only) */}
      {hasStatusTransition && (
        <div className="pl-8 flex items-center gap-2 mt-1">
          <ReporterStatusBadge
            status={entry.reporter_facing_status_before as ReporterFacingStatusEnum}
          />
          <span className="text-text-muted text-xs">→</span>
          <ReporterStatusBadge
            status={entry.reporter_facing_status_after as ReporterFacingStatusEnum}
          />
        </div>
      )}
    </div>
  );
}
