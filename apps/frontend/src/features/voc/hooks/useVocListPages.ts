import { placeholderDataForSearchOnly } from '@/lib/query/placeholder-data-for-search';
import { hashKey, useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  allowTabChange: boolean,
  previousData: TData | undefined,
  previousQuery: KeyedQuery | undefined,
): TData | undefined {
  const sameScope = placeholderDataForSearchOnly(queryKey, previousData, previousQuery);
  if (sameScope !== undefined || previousQuery === undefined) return sameScope;
  if (!allowTabChange) return undefined;
  return placeholderDataForSearchOnly(withoutTab(queryKey), previousData, {
    queryKey: withoutTab(previousQuery.queryKey),
    state: previousQuery.state,
  });
}

export type SearchTabTransition = {
  fromQ: string;
  fromTab: string | undefined;
  toQ: string;
  toTab: string | undefined;
};

export type UseVocListPagesParams = Pick<
  UseVocListParams,
  'managedSystemId' | 'tab' | 'q' | 'filters' | 'sort'
> & { view: 'inbox' | 'my'; searchTabTransition?: SearchTabTransition | undefined };

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
  // TanStack supplies the last data-bearing query, which may predate a pending
  // search. Track the immediately requested key too, so a later tab click cannot
  // inherit that search's exception. State adjustment avoids render-time ref writes.
  const keyHash = hashKey(queryKey);
  const scopeHash = hashKey([view, { managedSystemId, tab, filters, sort }]);
  const [requested, setRequested] = useState({
    keyHash,
    scopeHash,
    q,
    tab,
    allowTabChange: false,
    block: false,
  });
  let transition = requested;
  if (requested.keyHash !== keyHash) {
    const intent = params.searchTabTransition;
    const allowTabChange =
      (intent !== undefined &&
        intent.fromQ === (requested.q ?? '') &&
        intent.fromTab === requested.tab &&
        intent.toQ === (q ?? '') &&
        intent.toTab === tab) ||
      (requested.scopeHash === scopeHash && requested.allowTabChange);
    transition = {
      keyHash,
      scopeHash,
      q,
      tab,
      allowTabChange,
      block: requested.tab !== tab && !allowTabChange,
    };
    setRequested(transition);
  }
  return useInfiniteQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      transition.block
        ? undefined
        : placeholderPages(queryKey, transition.allowTabChange, previousData, previousQuery),
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
