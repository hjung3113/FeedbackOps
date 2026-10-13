import { apiRequest } from '@/lib/api';
import { listSurveysResponseSchema, surveyEvidenceCandidatesResponseSchema } from '@fops/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

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
  return useInfiniteQuery({
    queryKey: surveyEvidenceCandidatesKey(surveyId),
    enabled: surveyId !== null,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam !== undefined) params.set('cursor', pageParam);
      return (
        await apiRequest(
          'GET',
          `/surveys/${surveyId}/evidence-candidates?${params}`,
          surveyEvidenceCandidatesResponseSchema,
          { signal },
        )
      ).data;
    },
    getNextPageParam: (page) => (page.page.has_more ? page.page.cursor : undefined),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
