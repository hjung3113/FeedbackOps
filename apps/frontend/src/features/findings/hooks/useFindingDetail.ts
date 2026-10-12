import { apiRequest } from '@/lib/api';
import { ApiError, ApiParseError } from '@/lib/api/types';
import { findingDtoSchema } from '@fops/shared';
import type { FindingDto } from '@fops/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

export function useFindingDetail(id: string | null | undefined): UseQueryResult<FindingDto> {
  return useQuery({
    queryKey: ['finding', id] as const,
    queryFn: async ({ signal }) => {
      const res = await apiRequest<FindingDto>(
        'GET',
        `/findings/${id as string}`,
        findingDtoSchema,
        { signal },
      );
      return res.data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
    // Parse failures and 4xx are deterministic: retrying them only delays the
    // error state (a stale /findings?selected=… is not reconciled until the
    // detail query settles, so the default 1s backoff delays the URL cleanup).
    // Same predicate as useFindingsList; 429 and 5xx still retry once.
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
