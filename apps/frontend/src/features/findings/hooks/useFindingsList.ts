// useFindingsList — react-query wrapper for GET /findings.
// Optional managed_system_id and execution=none mirror the backend query params.
// Absent execution leaves the list unfiltered.

import { apiRequest } from '@/lib/api';
import { ApiError, ApiParseError } from '@/lib/api/types';
import { listFindingsResponseSchema } from '@fops/shared';
import type { ListFindingsResponse } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useFindingsList(
  managedSystemId?: string,
  execution?: 'none',
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
  });
}
