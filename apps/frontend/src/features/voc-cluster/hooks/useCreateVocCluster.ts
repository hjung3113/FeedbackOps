// useCreateVocCluster — POST /voc-clusters.
// Invalidates the cluster list on success.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api';
import type { CreateVocClusterRequest, VocClusterDto } from '@fops/shared';
import { invalidateNavCounts } from '@/lib/query/navCounts';

export function useCreateVocCluster(): UseMutationResult<
  VocClusterDto,
  ApiError,
  CreateVocClusterRequest
> {
  const qc = useQueryClient();
  return useMutation<VocClusterDto, ApiError, CreateVocClusterRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<VocClusterDto>('POST', '/voc-clusters', { body });
      return res.data;
    },
    onSuccess: async () => {
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-clusters'] });
    },
  });
}
