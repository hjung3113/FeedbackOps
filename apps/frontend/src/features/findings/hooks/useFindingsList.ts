// useFindingsList — react-query wrapper for GET /findings.
// Optional managed_system_id and execution=none mirror the backend query params.
// Absent execution leaves the list unfiltered.

import { apiRequest } from '@/lib/api';
import { ApiError, ApiParseError } from '@/lib/api/types';
import { placeholderDataForSearchOnly } from '@/lib/query/placeholder-data-for-search';
import { listFindingsResponseSchema } from '@fops/shared';
import type { ListFindingsResponse } from '@fops/shared';
import { type UseQueryResult, useInfiniteQuery, useQuery } from '@tanstack/react-query';

export function useFindingsList(
  managedSystemId?: string,
  execution?: 'none',
  enabled = true,
): UseQueryResult<ListFindingsResponse> {
  return useQuery({
    queryKey: ['findings', { managedSystemId, execution }] as const,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
      if (execution === 'none') params.set('execution', 'none');
      const query = params.toString();
      const path = query.length > 0 ? `/findings?${query}` : '/findings';
      const res = await apiRequest('GET', path, listFindingsResponseSchema, { signal });
      return res.data;
    },
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiParseError) &&
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) &&
      failureCount < 1,
    enabled,
  });
}

const PAGE_SIZE = 50;
export function useFindingsPages(
  managedSystemId?: string,
  execution?: 'none',
  assignment?: 'assigned' | 'unassigned',
  analyticsAreaId?: string,
  status?: 'active',
  q?: string,
) {
  const queryKey = [
    'findings',
    'pages',
    { managedSystemId, execution, assignment, analyticsAreaId, status, q },
  ] as const;
  return useInfiniteQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      placeholderDataForSearchOnly(queryKey, previousData, previousQuery),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
      if (execution !== undefined) params.set('execution', execution);
      if (assignment !== undefined) params.set('assignment', assignment);
      if (analyticsAreaId !== undefined) params.set('analytics_area_id', analyticsAreaId);
      if (status !== undefined) params.set('status', status);
      if (q !== undefined) params.set('q', q);
      if (pageParam !== undefined) params.set('cursor', pageParam);
      return (
        await apiRequest('GET', `/findings?${params}`, listFindingsResponseSchema, { signal })
      ).data;
    },
    getNextPageParam: (last: ListFindingsResponse) =>
      last.page?.has_more ? last.page.cursor : undefined,
    staleTime: 30_000,
    retry: (count, error) =>
      !(error instanceof ApiParseError) &&
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) &&
      count < 1,
  });
}

export function useFindingsTotal(managedSystemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['findings', 'total', { managedSystemId }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: '1' });
      if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
      return (
        await apiRequest('GET', `/findings?${params}`, listFindingsResponseSchema, { signal })
      ).data;
    },
    enabled,
    retry: (count, error) => !(error instanceof ApiParseError) && count < 1,
  });
}
