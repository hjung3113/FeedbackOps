// InternalTimeline — internal_comment entries with cursor pagination.
//
// KIND DECISION: passes `kind: 'internal_comment'` to useVocConversation so the
// BE-side cursor only returns internal entries. This avoids mixing public entries
// into the paginated tail. The server already enforces visibility per actor role,
// so an empty array here for Reporter-only viewers is expected.

import * as React from 'react';
import type { ConversationEntry } from '@fops/shared';
import { EmptyState, Button } from '@fops/ui';
import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { TimelineEntry } from './TimelineEntry';

export interface TimelineProps {
  vocId: string;
  inline: ConversationEntry[];
  hasMore: boolean;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}

export function InternalTimeline({
  vocId,
  inline,
  hasMore,
  actorNamesById,
}: TimelineProps): React.ReactElement {
  const query = useVocConversation({ vocId, kind: 'internal_comment' });
  const paginatedEntries: ConversationEntry[] =
    query.data?.pages.flatMap((p) => p.items) ?? [];
  const seenIds = new Set<string>();
  const entries = [...paginatedEntries, ...inline].filter((entry) => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });

  const showLoadMore = hasMore || query.hasNextPage === true;

  return (
    <div className="flex flex-col">
      {/* 더보기 at the top (older items) */}
      {showLoadMore && (
        <div className="flex justify-center py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? '불러오는 중…' : '이전 항목 더보기'}
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState size="sm" title="아직 대화가 없습니다." />
      ) : (
        entries.map((entry) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            actorDisplayName={actorNamesById?.get(entry.actor_id)}
          />
        ))
      )}
    </div>
  );
}
