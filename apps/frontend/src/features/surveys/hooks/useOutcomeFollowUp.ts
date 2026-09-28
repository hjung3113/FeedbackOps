import { type ApiError, apiRequest } from '@/lib/api';
import {
  type OutcomeFollowUpMarkedResult,
  type OutcomeFollowUpReadDto,
  type OutcomeFollowUpReopenedResult,
  outcomeFollowUpMarkedResultSchema,
  outcomeFollowUpReadDtoSchema,
  outcomeFollowUpReopenedResultSchema,
} from '@fops/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { surveyKeys } from './useSurveys';

interface OutcomeFollowUpDecisionVariables {
  responseId: string;
  reason: string;
  idempotencyKey: string;
}

function invalidateOutcomeFollowUp(
  queryClient: ReturnType<typeof useQueryClient>,
  surveyId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: surveyKeys.outcomeFollowUp(surveyId) }),
    queryClient.invalidateQueries({ queryKey: surveyKeys.results(surveyId) }),
  ]);
}

export function useOutcomeFollowUp(surveyId: string, enabled = true) {
  return useQuery<OutcomeFollowUpReadDto>({
    queryKey: surveyKeys.outcomeFollowUp(surveyId),
    queryFn: async ({ signal }) =>
      (
        await apiRequest(
          'GET',
          `/surveys/${surveyId}/outcome-follow-up`,
          outcomeFollowUpReadDtoSchema,
          { signal },
        )
      ).data,
    enabled: Boolean(surveyId) && enabled,
    retry: false,
  });
}

export function useMarkOutcomeFollowUpNoAction(surveyId: string) {
  const queryClient = useQueryClient();
  return useMutation<OutcomeFollowUpMarkedResult, ApiError, OutcomeFollowUpDecisionVariables>({
    mutationFn: async ({ responseId, reason, idempotencyKey }) =>
      (
        await apiRequest(
          'POST',
          `/survey-responses/${responseId}/mark-no-follow-up`,
          outcomeFollowUpMarkedResultSchema,
          { body: { reason }, idempotencyKey },
        )
      ).data,
    onSuccess: () => invalidateOutcomeFollowUp(queryClient, surveyId),
  });
}

export function useReopenOutcomeFollowUp(surveyId: string) {
  const queryClient = useQueryClient();
  return useMutation<OutcomeFollowUpReopenedResult, ApiError, OutcomeFollowUpDecisionVariables>({
    mutationFn: async ({ responseId, reason, idempotencyKey }) =>
      (
        await apiRequest(
          'POST',
          `/survey-responses/${responseId}/reopen-follow-up`,
          outcomeFollowUpReopenedResultSchema,
          { body: { reason }, idempotencyKey },
        )
      ).data,
    onSuccess: () => invalidateOutcomeFollowUp(queryClient, surveyId),
  });
}

export function invalidateOutcomeFollowUpAfterConflict(
  queryClient: ReturnType<typeof useQueryClient>,
  surveyId: string,
) {
  return invalidateOutcomeFollowUp(queryClient, surveyId);
}
