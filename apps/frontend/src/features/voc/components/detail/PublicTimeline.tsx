// PublicTimeline — public_update + reporter_reply entries with cursor pagination.
//
// KIND DECISION: conversation-query.ts declares `kind` as optional on the BE
// endpoint. `useVocConversation` accepts `kind?: 'public_update' | 'reporter_reply' |
// 'internal_comment'`. For the Public tab we pass `kind` as `undefined` so the
// server returns ALL kinds; we then filter client-side to public_update +
// reporter_reply. This is correct for Slice 3 because the endpoint does NOT
// expose a multi-kind filter (only a single optional kind), and the Reporter Reply
// kind is not separately paginatable via its own cursor — it co-exists with
// public_update in the same stream. Passing `kind: undefined` gives us the full
// stream from the cursor, and the inline entries already arrive pre-filtered to the
// right visibility surface by the BE.

import * as React from 'react';
import type { ConversationEntry } from '@fops/shared';
import { EmptyState, Button } from '@fops/ui';
import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { TimelineEntry } from './TimelineEntry';

export interface TimelineProps {
  vocId: string;
  inline: ConversationEntry[];
  hasMore: boolean;
}

export function PublicTimeline({ vocId, inline, hasMore }: TimelineProps): React.ReactElement {
  const query = useVocConversation({ vocId });
  // Pages from infinite query: these arrive only after the user clicks 더보기.
  const paginatedEntries: ConversationEntry[] =
    query.data?.pages.flatMap((p) => p.items).filter(
      (e) => e.kind === 'public_update' || e.kind === 'reporter_reply',
    ) ?? [];

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

      {paginatedEntries.map((entry) => (
        <TimelineEntry key={entry.id} entry={entry} />
      ))}

      {inline.length === 0 && paginatedEntries.length === 0 ? (
        <EmptyState size="sm" title="아직 대화가 없습니다." />
      ) : (
        inline.map((entry) => <TimelineEntry key={entry.id} entry={entry} />)
      )}
    </div>
  );
}
