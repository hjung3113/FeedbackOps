import { ApiError, apiRequest } from '@/lib/api';
import { listSurveysResponseSchema, surveyEvidenceCandidatesResponseSchema } from '@fops/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

export const surveyEvidenceCandidatesKey = (surveyId: string | null) =>
  ['findings', 'survey-evidence-candidates', surveyId] as const;

export function useSurveyEvidenceCatalog() {
  return useQuery({
    queryKey: ['findings', 'survey-evidence-catalog'],
    queryFn: async ({ signal }) =>
      (await apiRequest('GET', '/surveys', listSurveysResponseSchema, { signal })).data,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSurveyEvidenceCandidates(surveyId: string | null) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: surveyEvidenceCandidatesKey(surveyId),
    enabled: surveyId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam !== undefined) params.set('cursor', pageParam);
      try {
        return (
          await apiRequest(
            'GET',
            `/surveys/${surveyId}/evidence-candidates?${params}`,
            surveyEvidenceCandidatesResponseSchema,
            { signal },
          )
        ).data;
      } catch (error) {
        if (error instanceof ApiError && [403, 404, 409, 422].includes(error.status)) {
          // Discard denied previews and cursors. Every subsequent retry starts at page one,
          // and later transport failures cannot restore the previously loaded excerpts.
          queryClient.setQueryData(surveyEvidenceCandidatesKey(surveyId), {
            pages: [],
            pageParams: [],
          });
        }
        throw error;
      }
    },
    getNextPageParam: (page) => (page.page.has_more ? page.page.cursor : undefined),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
