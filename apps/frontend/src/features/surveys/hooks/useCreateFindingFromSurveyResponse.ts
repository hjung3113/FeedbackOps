import { type ApiError, apiClient } from '@/lib/api';
import type { CreateFindingFromSurveyResponseRequest, FindingDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveyKeys } from './useSurveys';

export interface CreateFindingFromSurveyResponseVariables {
  responseId: string;
  body: CreateFindingFromSurveyResponseRequest;
}

export function useCreateFindingFromSurveyResponse(
  surveyId: string,
): UseMutationResult<FindingDto, ApiError, CreateFindingFromSurveyResponseVariables> {
  const queryClient = useQueryClient();

  return useMutation<FindingDto, ApiError, CreateFindingFromSurveyResponseVariables>({
    mutationFn: async ({ responseId, body }) =>
      (
        await apiClient<FindingDto>('POST', `/survey-responses/${responseId}/create-finding`, {
          body,
        })
      ).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: surveyKeys.results(surveyId) }),
  });
}
