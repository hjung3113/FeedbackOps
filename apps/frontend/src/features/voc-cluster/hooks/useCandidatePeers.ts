// useCandidatePeers — paged GET /voc-clusters/:id/candidate-peers.
// The backend narrows the list to readable active VOCs in the cluster's Managed System, searched
// by `q` and paged by an opaque cursor. gcTime 0: closing the picker drops the cache so a reopen
// always starts from a fresh first page.

import { apiRequest } from '@/lib/api';
import { ApiError, ApiParseError } from '@/lib/api/types';
import { listSameManagedSystemCandidatePeersResponseSchema } from '@fops/shared';
import type { ListSameManagedSystemCandidatePeersResponse } from '@fops/shared';
import { useInfiniteQuery } from '@tanstack/react-query';

const PAGE_SIZE = 20;

export function useCandidatePeers(clusterId: string | null | undefined, q: string) {
  return useInfiniteQuery({
    queryKey: ['voc-cluster-candidate-peers', clusterId, { q }] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (q !== '') params.set('q', q);
      if (pageParam !== undefined) params.set('cursor', pageParam);
      const response = await apiRequest(
        'GET',
        `/voc-clusters/${clusterId as string}/candidate-peers?${params}`,
        listSameManagedSystemCandidatePeersResponseSchema,
        { signal },
      );
      return response.data;
    },
    getNextPageParam: (last: ListSameManagedSystemCandidatePeersResponse) =>
      last.page.has_more ? last.page.cursor : undefined,
    enabled: Boolean(clusterId),
    gcTime: 0,
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
