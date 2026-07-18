import { apiClient, type ApiError } from '@/lib/api';
import type {
  ListPublicUpdateReviewCandidatesResponse,
  ResolvePublicUpdateReviewCandidateRequest,
} from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function usePublicUpdateReviewCandidates(vocId: string, enabled: boolean) {
  return useQuery<ListPublicUpdateReviewCandidatesResponse, ApiError>({
    queryKey: ['voc-public-update-candidates', vocId],
    queryFn: async () => {
      const response = await apiClient<ListPublicUpdateReviewCandidatesResponse>(
        'GET',
        `/vocs/${vocId}/public-update-candidates`,
      );
      return response.data;
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useResolvePublicUpdateReviewCandidate(vocId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, ResolvePublicUpdateReviewCandidateRequest>({
    mutationFn: async (body) => {
      const response = await apiClient<unknown>('POST', `/vocs/${vocId}/apply-public-update-candidate`, {
        body,
      });
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['voc-public-update-candidates', vocId] }),
        queryClient.invalidateQueries({ queryKey: ['voc', vocId] }),
      ]);
    },
  });
}
