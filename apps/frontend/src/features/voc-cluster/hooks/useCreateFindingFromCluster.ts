// useCreateFindingFromCluster — POST /voc-clusters/:id/create-finding.
// Mirrors useCreateFindingFromVocMutation shape; apiClient auto-mints Idempotency-Key.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api';
import type { CreateFindingRequest, FindingDto } from '@fops/shared';
import { invalidateNavCounts } from '@/lib/query/navCounts';

export interface CreateFindingFromClusterVariables {
  clusterId: string;
  body: CreateFindingRequest;
}

export function useCreateFindingFromCluster(args?: {
  idempotencyKey?: string;
}): UseMutationResult<FindingDto, ApiError, CreateFindingFromClusterVariables> {
  const queryClient = useQueryClient();
  return useMutation<FindingDto, ApiError, CreateFindingFromClusterVariables>({
    mutationFn: async ({ clusterId, body }) => {
      const res = await apiClient<FindingDto>(
        'POST',
        `/voc-clusters/${clusterId}/create-finding`,
        {
          body,
          ...(args?.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
        },
      );
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      invalidateNavCounts(queryClient);
    },
  });
}
