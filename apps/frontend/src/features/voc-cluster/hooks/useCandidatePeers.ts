// useCandidatePeers — GET /voc-clusters/:id/candidate-peers.
// The backend narrows this list to active VOCs in the cluster's Managed System.

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { ListSameManagedSystemCandidatePeersResponse } from "@fops/shared";

import { apiClient } from "@/lib/api";

export function useCandidatePeers(
  clusterId: string | null | undefined,
): UseQueryResult<ListSameManagedSystemCandidatePeersResponse> {
  return useQuery({
    queryKey: ["voc-cluster-candidate-peers", clusterId] as const,
    queryFn: async ({ signal }) => {
      const response = await apiClient<ListSameManagedSystemCandidatePeersResponse>(
        "GET",
        `/voc-clusters/${clusterId as string}/candidate-peers`,
        { signal },
      );
      return response.data;
    },
    enabled: Boolean(clusterId),
    staleTime: 30_000,
    retry: 1,
  });
}
