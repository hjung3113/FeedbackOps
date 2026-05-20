import { useInfiniteQuery, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { ConversationEntry } from '@fops/shared';

export interface UseVocConversationParams {
  vocId: string;
  kind?: 'public_update' | 'reporter_reply' | 'internal_comment';
}

export interface ConversationPage {
  items: ConversationEntry[];
  next_cursor?: string;
  has_more: boolean;
}

export function useVocConversation(
  params: UseVocConversationParams,
): UseInfiniteQueryResult<{ pages: ConversationPage[] }> {
  const { vocId, kind } = params;

  return useInfiniteQuery({
    queryKey: ['voc-conversation', vocId, kind] as const,
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam as string;
      const cursorPart = cursor ? `cursor=${encodeURIComponent(cursor)}` : '';
      const kindPart = kind ? `kind=${encodeURIComponent(kind)}` : '';
      const queryParts = [cursorPart, kindPart].filter(Boolean).join('&');
      const url = `/vocs/${vocId}/conversation${queryParts ? `?${queryParts}` : ''}`;
      const res = await apiClient<ConversationPage>('GET', url, { signal });
      return res.data;
    },
    initialPageParam: '',
    getNextPageParam: (lastPage: ConversationPage) =>
      lastPage.has_more ? lastPage.next_cursor : undefined,
    enabled: Boolean(vocId),
    staleTime: 10_000,
  });
}
