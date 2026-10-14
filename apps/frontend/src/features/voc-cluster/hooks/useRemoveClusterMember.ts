// useRemoveClusterMember — DELETE /voc-clusters/:id/vocs/:vocId.
// Invalidates the cluster detail query on success.

import { type ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

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
      invalidateRecovery(qc);
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
    },
  });
}
