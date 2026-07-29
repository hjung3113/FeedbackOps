import { type ApiError, apiClient } from '@/lib/api';
import { type SurveyResultDto, surveyResultDtoSchema } from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuestionInput, Survey } from '../types';

export const surveyKeys = {
  list: ['surveys'] as const,
  detail: (id: string) => ['surveys', id] as const,
  results: (id: string) => ['surveys', id, 'results'] as const,
};

export function useSurveys() {
  return useQuery({
    queryKey: surveyKeys.list,
    queryFn: async ({ signal }) => (await apiClient<Survey[]>('GET', '/surveys', { signal })).data,
    retry: 1,
  });
}

export function useSurveyResults(id: string, enabled = true) {
  return useQuery({
    queryKey: surveyKeys.results(id),
    queryFn: async ({ signal }): Promise<SurveyResultDto> =>
      surveyResultDtoSchema.parse(
        (await apiClient<unknown>('GET', `/surveys/${id}/results`, { signal })).data,
      ),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useSurvey(id: string) {
  return useQuery({
    queryKey: surveyKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await apiClient<Survey>('GET', `/surveys/${id}`, { signal })).data,
    enabled: Boolean(id),
    retry: false,
  });
}

function useQuestionMutation(
  method: 'POST' | 'PATCH' | 'DELETE',
  surveyId: string,
  questionId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body?: QuestionInput) => {
      const suffix = questionId ? `/questions/${questionId}` : '/questions';
      return (
        await apiClient<SurveyQuestionResponse>(
          method,
          `/surveys/${surveyId}${suffix}`,
          body ? { body } : {},
        )
      ).data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: surveyKeys.detail(surveyId),
      }),
  });
}

type SurveyQuestionResponse = { id: string };
export const useCreateSurveyQuestion = (surveyId: string) => useQuestionMutation('POST', surveyId);
export const useUpdateSurveyQuestion = (surveyId: string, questionId: string) =>
  useQuestionMutation('PATCH', surveyId, questionId);
export const useDeleteSurveyQuestion = (surveyId: string, questionId: string) =>
  useQuestionMutation('DELETE', surveyId, questionId);

function useSurveyStatusMutation(surveyId: string, target: 'open' | 'close') {
  const queryClient = useQueryClient();
  return useMutation<Survey, ApiError, void>({
    mutationFn: async () =>
      (await apiClient<Survey>('POST', `/surveys/${surveyId}/${target}`)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: surveyKeys.detail(surveyId) });
      void queryClient.invalidateQueries({ queryKey: surveyKeys.list });
    },
  });
}

export const useOpenSurvey = (surveyId: string) => useSurveyStatusMutation(surveyId, 'open');
export const useCloseSurvey = (surveyId: string) => useSurveyStatusMutation(surveyId, 'close');

export function useSurveyQuestionMutations(surveyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: surveyKeys.detail(surveyId),
    });
  const create = useMutation({
    mutationFn: async (body: QuestionInput) =>
      (await apiClient<SurveyQuestionResponse>('POST', `/surveys/${surveyId}/questions`, { body }))
        .data,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: QuestionInput }) =>
      (
        await apiClient<SurveyQuestionResponse>('PATCH', `/surveys/${surveyId}/questions/${id}`, {
          body,
        })
      ).data,
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await apiClient<SurveyQuestionResponse>('DELETE', `/surveys/${surveyId}/questions/${id}`))
        .data,
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
