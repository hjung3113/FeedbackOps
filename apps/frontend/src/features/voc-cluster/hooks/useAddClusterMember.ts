// useAddClusterMember — POST /voc-clusters/:id/vocs.
// Invalidates the cluster detail query on success.

import { type ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AddClusterMemberVariables {
  clusterId: string;
  vocId: string;
}

export function useAddClusterMember(): UseMutationResult<
  void,
  ApiError,
  AddClusterMemberVariables
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, AddClusterMemberVariables>({
    mutationFn: async ({ clusterId, vocId }) => {
      await apiClient('POST', `/voc-clusters/${clusterId}/vocs`, { body: { voc_id: vocId } });
    },
    onSuccess: async (_data, { clusterId }) => {
      invalidateRecovery(qc);
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
    },
  });
}
