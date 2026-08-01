// useFindingsList — react-query wrapper for GET /findings.
// Optional managed_system_id filter mirrors the backend query param.

import { apiClient } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import type { ListFindingsResponse } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useFindingsList(managedSystemId?: string): UseQueryResult<ListFindingsResponse> {
  return useQuery({
    queryKey: ['findings', { managedSystemId }] as const,
    queryFn: async ({ signal }) => {
      const path = managedSystemId
        ? `/findings?managed_system_id=${encodeURIComponent(managedSystemId)}`
        : '/findings';
      const res = await apiClient<ListFindingsResponse>('GET', path, { signal });
      return res.data;
    },
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) &&
      failureCount < 1,
  });
}
