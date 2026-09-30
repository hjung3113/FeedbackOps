// useAddClusterMember — POST /voc-clusters/:id/vocs.
// Invalidates the cluster detail query on success.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';

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
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
    },
  });
}
