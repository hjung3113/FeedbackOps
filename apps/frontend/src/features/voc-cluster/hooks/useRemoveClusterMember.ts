// useRemoveClusterMember — DELETE /voc-clusters/:id/vocs/:vocId.
// Invalidates the cluster detail query on success.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api';

export interface RemoveClusterMemberVariables {
  clusterId: string;
  vocId: string;
}

export function useRemoveClusterMember(): UseMutationResult<
  void,
  ApiError,
  RemoveClusterMemberVariables
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, RemoveClusterMemberVariables>({
    mutationFn: async ({ clusterId, vocId }) => {
      await apiClient('DELETE', `/voc-clusters/${clusterId}/vocs/${vocId}`);
    },
    onSuccess: async (_data, { clusterId }) => {
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
    },
  });
}
