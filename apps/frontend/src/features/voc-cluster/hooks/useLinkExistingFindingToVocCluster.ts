// useLinkExistingFindingToVocCluster — command-only association that refreshes
// the cluster detail so its backend-authorized linked_findings are rendered.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { LinkedFindingDto } from "@fops/shared";

import { apiClient, type ApiError } from "@/lib/api";

export interface LinkExistingFindingToVocClusterVariables {
  clusterId: string;
  findingId: string;
}

export function useLinkExistingFindingToVocCluster(args?: {
  idempotencyKey?: string;
}): UseMutationResult<
  LinkedFindingDto,
  ApiError,
  LinkExistingFindingToVocClusterVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clusterId, findingId }) => {
      const response = await apiClient<LinkedFindingDto>(
        "POST",
        `/voc-clusters/${clusterId}/link-finding`,
        {
          body: { finding_id: findingId },
          ...(args?.idempotencyKey
            ? { idempotencyKey: args.idempotencyKey }
            : {}),
        },
      );
      return response.data;
    },
    onSuccess: async (_finding, { clusterId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["voc-cluster", clusterId],
      });
    },
  });
}
