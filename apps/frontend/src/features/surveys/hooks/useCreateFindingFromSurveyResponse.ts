import { type ApiError, apiClient } from '@/lib/api';
import type { CreateFindingFromSurveyResponseRequest, FindingDto } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { surveyKeys } from './useSurveys';
import { invalidateNavCounts } from '@/lib/query/navCounts';

export interface CreateFindingFromSurveyResponseVariables {
  responseId: string;
  body: CreateFindingFromSurveyResponseRequest;
}

type CreateFindingSuccess = (
  finding: FindingDto,
  variables: CreateFindingFromSurveyResponseVariables,
) => void;

export function useCreateFindingFromSurveyResponse(
  surveyId: string,
  onSuccess?: CreateFindingSuccess,
): UseMutationResult<FindingDto, ApiError, CreateFindingFromSurveyResponseVariables> {
  const queryClient = useQueryClient();

  return useMutation<FindingDto, ApiError, CreateFindingFromSurveyResponseVariables>({
    mutationFn: async ({ responseId, body }) =>
      (
        await apiClient<FindingDto>('POST', `/survey-responses/${responseId}/create-finding`, {
          body,
        })
      ).data,
    onSuccess: (finding, variables) => {
      invalidateNavCounts(queryClient);
      onSuccess?.(finding, variables);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: surveyKeys.results(surveyId) }),
        queryClient.invalidateQueries({ queryKey: surveyKeys.outcomeFollowUp(surveyId) }),
      ]);
    },
  });
}
