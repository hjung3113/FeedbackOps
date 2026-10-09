import { apiClient } from '@/lib/api';
import type { VocListItem } from '@fops/shared';
import { type UseQueryResult, hashKey, keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef } from 'react';

export interface UseVocListParams {
  view: 'inbox' | 'my' | 'triage';
  managedSystemId?: string;
  tab?: string;
  /**
   * #821 server-side text search. Inbox/my views only; the backend rejects it
   * for view=triage. Goes into the query key and, when present, the query string.
   */
  q?: string;
  filters?: Record<string, string[]>;
  sort?: string;
  cursor?: string;
  limit?: number;
  /**
   * #383: carries the re-triage deep link's target into the triage queue.
   * The queue predicate excludes already-triaged VOCs, so without this the
   * "Triage에서 변경" link lands on a queue that cannot show what it points at.
   * view='triage' only — the backend rejects it on other views.
   */
  pinVocId?: string;
  /**
   * REV-2 #9: when false the query stays in 'pending' status and does not
   * fire its queryFn. Used by TriageRoute to avoid fetching the queue
   * before the capability gate decides.
   */
  enabled?: boolean;
}

export interface VocListPage {
  items: VocListItem[];
  next_cursor?: string;
  out_of_scope_summary?: {
    count: number;
    severity_distribution: Record<string, number>;
  };
}

export function useVocList(params: UseVocListParams): UseQueryResult<VocListPage> {
  const { view, managedSystemId, tab, q, filters, sort, cursor, limit, pinVocId, enabled } = params;

  const queryKey = [
    'vocs',
    view,
    managedSystemId,
    tab,
    q,
    filters,
    sort,
    cursor,
    pinVocId,
  ] as const;

  const contextKey = view === 'triage' ? hashKey([...queryKey.slice(0, -1), limit]) : '';
  const retainedPage = useRef<{ contextKey: string; data: VocListPage } | null>(null);
  if (retainedPage.current?.contextKey !== contextKey) retainedPage.current = null;

  const query = useQuery({
    // pinVocId belongs in the key: two deep links differing only by target must
    // not share a cached queue (#383). q likewise (#821) — a search must not
    // read another search's cached page.
    queryKey,
    enabled: enabled !== false,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams();
      qs.set('view', view);
      if (managedSystemId) qs.set('managed_system_id', managedSystemId);
      if (tab) qs.set('tab', tab);
      if (q) qs.set('q', q);
      if (filters) {
        for (const [filterKey, values] of Object.entries(filters)) {
          if (values.length > 0) {
            // Filter keys are unified on the URL/UI name (`filter.reporterStatus`,
            // matching the prototype's `reporterStatus`). The backend list
            // endpoint expects the long-form param `filter.reporter_facing_status`,
            // so we translate ONLY at this query-string boundary. Keeping the
            // single UI key everywhere else removes the prior dual-key mismatch
            // (#89) where FILTER_CATEGORIES used a key that never appeared in the URL.
            const param =
              filterKey === 'filter.reporterStatus' ? 'filter.reporter_facing_status' : filterKey;
            qs.set(param, values.join(','));
          }
        }
      }
      if (pinVocId) qs.set('pin_voc_id', pinVocId);
      if (sort) qs.set('sort', sort);
      if (cursor) qs.set('cursor', cursor);
      if (limit !== undefined) qs.set('limit', String(limit));

      const res = await apiClient<VocListPage>('GET', `/vocs?${qs.toString()}`, { signal });
      return res.data;
    },
    // #864: a blur commit changes this key before the row's click. Keep the
    // previous page (rows keyed by voc.id) mounted until the next one arrives.
    // A first load has no previous page, so pending/error stay as they were.
    // Triage keeps rows only for a pin-only change; tabs/scopes still load empty.
    placeholderData:
      view === 'triage'
        ? (previousData, previousQuery) =>
            previousQuery &&
            hashKey(previousQuery.queryKey.slice(0, -1)) === hashKey(queryKey.slice(0, -1))
              ? previousData
              : undefined
        : keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  });
  // Placeholder data disappears on error. Retain only a real successful page
  // from this full non-pin context; the failed query still cannot settle exclusions.
  if (view === 'triage' && query.isSuccess && !query.isPlaceholderData) {
    retainedPage.current = { contextKey, data: query.data };
  }
  if (view === 'triage' && query.isError && !query.data && retainedPage.current) {
    return {
      ...query,
      data: retainedPage.current.data,
      isLoadingError: false,
      isRefetchError: true,
    };
  }
  return query;
}
