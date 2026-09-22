// ProgressNotesSection — Finding/Task append-only progress-note timeline (#377).
//
// A dedicated component per the #377 FE brief: the VOC ConversationTimeline is
// bound to public/internal tabs and VOC kind labels and is deliberately NOT
// reused. Structure follows the VOC InternalTimeline cursor pattern — newest
// entry at the bottom, "load more" control at the top prepends older pages.
//
// Copy is per-surface (brief copy table): the Finding panel is Korean, the
// Task panel is English. The composer renders only with manage-level
// permission; the timeline itself is a read surface (backend remains
// authoritative — a denied read renders a permission-blocked panel).

import { ApiError } from '@/lib/api/types';
import type { FindingStatus, TaskStatus } from '@fops/shared';
import { Button, EmptyState, PermissionBlockedPanel } from '@fops/ui';
import type * as React from 'react';
import { ProgressNoteEntry, type RenderStatusBadge } from './ProgressNoteEntry';
import { ProgressNotesComposer } from './ProgressNotesComposer';
import { useProgressNotesList } from './useProgressNotes';

const COPY = {
  finding: {
    empty: '아직 진행 메모가 없습니다.',
    loading: '불러오는 중…',
    loadMore: '이전 항목 더보기',
    loadingMore: '불러오는 중…',
    loadError: '진행 메모를 불러올 수 없습니다.',
    blockedCategory: '진행 메모',
    actorFallback: '진행 메모 작성자',
    kindBadge: { note: '메모', status_change: '상태 변경' } as const,
  },
  task: {
    empty: 'No progress notes yet.',
    loading: 'Loading…',
    loadMore: 'Load earlier notes',
    loadingMore: 'Loading…',
    loadError: 'Unable to load progress notes.',
    blockedCategory: 'Progress notes',
    actorFallback: 'Progress note author',
    kindBadge: { note: 'Note', status_change: 'Status change' } as const,
  },
} as const;

type FindingNotesProps = {
  resource: { kind: 'finding'; id: string };
  /** finding.manage hint — composer renders only when true; backend is authoritative. */
  canCompose: boolean;
  actorNamesById?: ReadonlyMap<string, string>;
  renderStatusBadge?: (status: FindingStatus) => React.ReactNode;
};

type TaskNotesProps = {
  resource: { kind: 'task'; id: string };
  canCompose: boolean;
  actorNamesById?: ReadonlyMap<string, string>;
  renderStatusBadge?: (status: TaskStatus) => React.ReactNode;
};

export type ProgressNotesSectionProps = FindingNotesProps | TaskNotesProps;

export function ProgressNotesSection(props: ProgressNotesSectionProps): React.ReactElement {
  const { resource, canCompose, actorNamesById } = props;
  const copy = COPY[resource.kind];
  const query = useProgressNotesList(resource);

  if (query.isPending) {
    return <div className="py-2 text-sm text-text-muted">{copy.loading}</div>;
  }

  if (query.isError) {
    // Backend gates Task comment reads behind finding.manage + elevated role,
    // so a plain User legitimately gets 403 here (#377 checklist: FE maps the
    // error, it does not hide the section).
    if (query.error instanceof ApiError && query.error.status === 403) {
      return <PermissionBlockedPanel state="denied" category={copy.blockedCategory} />;
    }
    return <div className="py-2 text-sm text-accent-danger">{copy.loadError}</div>;
  }

  // Server pages are newest-first (created_at DESC); render chronologically so
  // fetching an older page prepends it above, matching the VOC InternalTimeline.
  const entries = (query.data?.pages ?? []).flatMap((page) => page.items).reverse();

  // NOT a type-narrowing cast (astra medium review, PR #450): TS does not
  // narrow renderStatusBadge's type from resource.kind here. Safety instead
  // comes from the caller: FindingNotesProps/TaskNotesProps are constructed
  // together at each call site (props.resource.kind and
  // props.renderStatusBadge always come from the same typed union member),
  // so the two per-kind badge renderers never cross with the wrong resource.
  const statusBadge = props.renderStatusBadge as RenderStatusBadge;

  return (
    <div className="flex flex-col" data-testid="progress-notes-section">
      {query.hasNextPage && (
        <div className="flex justify-center py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState size="sm" title={copy.empty} />
      ) : (
        entries.map((entry, index) => (
          <ProgressNoteEntry
            key={entry.id}
            entry={entry}
            kindBadgeLabel={copy.kindBadge[entry.kind]}
            actorDisplayName={actorNamesById?.get(entry.actor_id)}
            actorFallbackName={copy.actorFallback}
            renderStatusBadge={statusBadge}
            isLast={index === entries.length - 1}
          />
        ))
      )}

      {canCompose && <ProgressNotesComposer resource={resource} />}
    </div>
  );
}
