// useCreateFindingFromCluster — POST /voc-clusters/:id/create-finding.
// Mirrors useCreateFindingFromVocMutation shape; apiClient auto-mints Idempotency-Key.

import { type ApiError, apiClient } from '@/lib/api';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import type { CreateFindingRequest, FindingDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

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
      invalidateRecovery(queryClient);
      invalidateNavCounts(queryClient);
    },
  });
}
