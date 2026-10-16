import { placeholderDataForSearchOnly } from '@/lib/query/placeholder-data-for-search';
import { useInfiniteQuery } from '@tanstack/react-query';
import { type UseVocListParams, type VocListPage, fetchVocListPage } from './useVocList';

export const VOC_PAGE_SIZE = 50;

type KeyedQuery = { queryKey: readonly unknown[]; state: { status: string } };

function withoutTab(queryKey: readonly unknown[]): unknown[] {
  return queryKey.map((part) =>
    typeof part === 'object' && part !== null && !Array.isArray(part) && 'tab' in part
      ? { ...part, tab: undefined }
      : part,
  );
}

/**
 * Keep the loaded pages for a `q`-only change. Starting or clearing an Inbox search also
 * drops or restores the tab (#821), and the blur commit that does so lands before a row
 * click (#864): that transition keeps them too. Any other key change shows page one loading.
 */
function placeholderPages<TData>(
  queryKey: readonly unknown[],
  hasQ: boolean,
  previousData: TData | undefined,
  previousQuery: KeyedQuery | undefined,
): TData | undefined {
  const sameScope = placeholderDataForSearchOnly(queryKey, previousData, previousQuery);
  if (sameScope !== undefined || previousQuery === undefined) return sameScope;
  const previousSegment = previousQuery.queryKey[3] as { q?: string } | undefined;
  if (Boolean(previousSegment?.q) === hasQ) return undefined;
  return placeholderDataForSearchOnly(withoutTab(queryKey), previousData, {
    queryKey: withoutTab(previousQuery.queryKey),
    state: previousQuery.state,
  });
}

export type UseVocListPagesParams = Pick<
  UseVocListParams,
  'managedSystemId' | 'tab' | 'q' | 'filters' | 'sort'
> & { view: 'inbox' | 'my' };

/**
 * Inbox and 내 VOC: cursor pages of 50 (same pattern as `useFindingsPages`).
 * The cursor never enters the URL or the query key; any key change restarts at
 * page one, and only a `q`-only change keeps the loaded pages as placeholder.
 * Triage keeps its single working page on `useVocList`.
 */
export function useVocListPages(params: UseVocListPagesParams) {
  const { view, managedSystemId, tab, q, filters, sort } = params;
  // q sits in a plain-object segment so placeholderDataForSearchOnly can drop it.
  const queryKey = ['vocs', view, 'pages', { managedSystemId, tab, q, filters, sort }] as const;
  return useInfiniteQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      placeholderPages(queryKey, Boolean(q), previousData, previousQuery),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      fetchVocListPage(
        { view, managedSystemId, tab, q, filters, sort, limit: VOC_PAGE_SIZE, pinVocId: undefined },
        { signal, cursor: pageParam },
      ),
    getNextPageParam: (last: VocListPage) => (last.page?.has_more ? last.page.cursor : undefined),
    staleTime: 30_000,
    retry: 1,
  });
}
