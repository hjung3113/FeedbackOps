import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { VocListItem } from '@fops/shared';

export interface UseVocListParams {
  view: 'inbox' | 'my' | 'triage';
  managedSystemId?: string;
  tab?: string;
  filters?: Record<string, string[]>;
  sort?: string;
  cursor?: string;
  limit?: number;
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
  const { view, managedSystemId, tab, filters, sort, cursor, limit, enabled } = params;

  return useQuery({
    queryKey: ['vocs', view, managedSystemId, tab, filters, sort, cursor] as const,
    enabled: enabled !== false,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams();
      qs.set('view', view);
      if (managedSystemId) qs.set('managed_system_id', managedSystemId);
      if (tab) qs.set('tab', tab);
      if (filters) {
        for (const [filterKey, values] of Object.entries(filters)) {
          if (values.length > 0) {
            qs.set(filterKey, values.join(','));
          }
        }
      }
      if (sort) qs.set('sort', sort);
      if (cursor) qs.set('cursor', cursor);
      if (limit !== undefined) qs.set('limit', String(limit));

      const res = await apiClient<VocListPage>('GET', `/vocs?${qs.toString()}`, { signal });
      return res.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
