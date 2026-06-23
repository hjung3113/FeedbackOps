// useConfirmCluster — PATCH /voc-clusters/:id { status: 'confirmed' }.
// Invalidates the cluster detail and list queries on success.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api';
import type { VocClusterDto } from '@fops/shared';

export function useConfirmCluster(): UseMutationResult<VocClusterDto, ApiError, string> {
  const qc = useQueryClient();
  return useMutation<VocClusterDto, ApiError, string>({
    mutationFn: async (clusterId) => {
      const res = await apiClient<VocClusterDto>('PATCH', `/voc-clusters/${clusterId}`, {
        body: { status: 'confirmed' },
      });
      return res.data;
    },
    onSuccess: async (_data, clusterId) => {
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
      await qc.invalidateQueries({ queryKey: ['voc-clusters'] });
    },
  });
}
