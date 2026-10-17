import { type ApiError, ApiParseError, apiClient, apiRequest } from '@/lib/api';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { ListSurveysQuery } from '@fops/shared';
import {
  type AnswerableSurveysResponse,
  type MySurveyResponsesResponse,
  type SurveyResponseSubmission,
  type SurveyResultDto,
  answerableSurveysResponseSchema,
  listSurveysResponseSchema,
  mySurveyResponsesResponseSchema,
  surveyCopySourceResponseSchema,
  surveyCopySourcesResponseSchema,
  surveyDetailDtoSchema,
  surveyDtoSchema,
  surveyRespondentFormDtoSchema,
  surveyResponseSubmittedDtoSchema,
  surveyResultDtoSchema,
  surveyTemplatesResponseSchema,
} from '@fops/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { surveyResultsReadDenialKeys } from '../policy/resultsReadDenial';
import type { CreateSurveyInput, QuestionInput, Survey, SurveyPatchInput } from '../types';

export const surveyKeys = {
  list: ['surveys'] as const,
  listScoped: (managedSystemId: string) => ['surveys', { managedSystemId }] as const,
  detail: (id: string) => ['surveys', id] as const,
  results: (id: string) => ['surveys', id, 'results'] as const,
  answerable: ['surveys', 'participation', 'answerable'] as const,
  myResponses: ['surveys', 'participation', 'history'] as const,
  respondentForm: (id: string) => ['surveys', 'participation', id, 'form'] as const,
  resultsReadDenialPrefix: surveyResultsReadDenialKeys.prefix,
  resultsReadDenial: surveyResultsReadDenialKeys.bySurvey,
  outcomeFollowUp: (id: string) => ['surveys', id, 'outcome-follow-up'] as const,
};

export function useAnswerableSurveys() {
  return useInfiniteQuery({
    queryKey: surveyKeys.answerable,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<AnswerableSurveysResponse> =>
      (
        await apiRequest(
          'GET',
          `/me/answerable-surveys${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
          answerableSurveysResponseSchema,
          { signal },
        )
      ).data,
    getNextPageParam: (lastPage) => (lastPage.page.has_more ? lastPage.page.cursor : undefined),
    retry: false,
  });
}

export function useMySurveyResponses() {
  return useInfiniteQuery({
    queryKey: surveyKeys.myResponses,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<MySurveyResponsesResponse> =>
      (
        await apiRequest(
          'GET',
          `/me/survey-responses${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
          mySurveyResponsesResponseSchema,
          { signal },
        )
      ).data,
    getNextPageParam: (lastPage) => (lastPage.page.has_more ? lastPage.page.cursor : undefined),
    retry: false,
  });
}

export function useSurveyRespondentForm(surveyId: string) {
  return useQuery({
    queryKey: surveyKeys.respondentForm(surveyId),
    queryFn: async ({ signal }) =>
      (
        await apiRequest('GET', `/surveys/${surveyId}/form`, surveyRespondentFormDtoSchema, {
          signal,
        })
      ).data,
    enabled: Boolean(surveyId),
    retry: false,
  });
}

export function useSubmitSurveyResponse(surveyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      idempotencyKey,
    }: {
      body: SurveyResponseSubmission;
      idempotencyKey: string;
    }) =>
      (
        await apiRequest(
          'POST',
          `/surveys/${surveyId}/responses`,
          surveyResponseSubmittedDtoSchema,
          {
            body,
            idempotencyKey,
          },
        )
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: surveyKeys.answerable });
      void queryClient.invalidateQueries({ queryKey: surveyKeys.myResponses });
    },
  });
}

// Optional managed_system_id filter mirrors the backend GET /surveys query
// param (uuid | 'all' on the wire; 'all' resolves to no filter = the caller's
// effective scope union). The scoped key extends surveyKeys.list, so the
// existing `['surveys']` invalidations still cover it.
export function useSurveys(
  managedSystemId?: string,
  filters: Omit<ListSurveysQuery, 'managed_system_id'> = {},
) {
  const query = new URLSearchParams();
  if (managedSystemId) query.set('managed_system_id', managedSystemId);
  if (filters.analytics_area_id !== undefined)
    query.set('analytics_area_id', filters.analytics_area_id);
  if (filters.status !== undefined) query.set('status', filters.status);
  if (filters.follow_up !== undefined) query.set('follow_up', filters.follow_up);
  const baseKey = managedSystemId ? surveyKeys.listScoped(managedSystemId) : surveyKeys.list;
  const hasFilters =
    filters.analytics_area_id !== undefined ||
    filters.status !== undefined ||
    filters.follow_up !== undefined;
  return useQuery({
    queryKey: hasFilters ? [...baseKey, filters] : baseKey,
    queryFn: async ({ signal }) =>
      (
        await apiRequest(
          'GET',
          query.size > 0 ? `/surveys?${query.toString()}` : '/surveys',
          listSurveysResponseSchema,
          { signal },
        )
      ).data,
    // A parse failure is deterministic: retrying it only delays the error.
    retry: (failureCount, error) => !(error instanceof ApiParseError) && failureCount < 1,
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
      (await apiRequest<Survey>('GET', `/surveys/${id}`, surveyDetailDtoSchema, { signal })).data,
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  const attempt = useRef<{ serialized: string; key: string } | null>(null);
  const mutation = useMutation<Survey, ApiError, CreateSurveyInput>({
    mutationFn: async (body) => {
      const serialized = JSON.stringify(body);
      if (attempt.current?.serialized !== serialized) {
        attempt.current = { serialized, key: mintIdempotencyKey() };
      }
      return (
        await apiRequest('POST', '/surveys', surveyDtoSchema, {
          body,
          idempotencyKey: attempt.current.key,
        })
      ).data;
    },
    onSuccess: () => {
      attempt.current = null;
      invalidateNavCounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: surveyKeys.list });
    },
  });
  const resetMutation = mutation.reset;
  const reset = useCallback(() => {
    attempt.current = null;
    resetMutation();
  }, [resetMutation]);
  return { ...mutation, reset };
}
type SurveyQuestionResponse = { id: string };

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
  const updateSurvey = useMutation({
    mutationFn: async (body: SurveyPatchInput) =>
      (await apiClient<Survey>('PATCH', `/surveys/${surveyId}`, { body })).data,
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: async (questionIds: string[]) =>
      (
        await apiClient<Survey>('PATCH', `/surveys/${surveyId}/questions/reorder`, {
          body: { question_ids: questionIds },
        })
      ).data,
    onSuccess: invalidate,
  });
  return { create, update, remove, updateSurvey, reorder };
}

export function useSurveyTemplates(system: string, enabled: boolean) {
  return useQuery({
    queryKey: ['survey-templates', system],
    queryFn: async ({ signal }) =>
      (
        await apiRequest(
          'GET',
          `/surveys/templates?managed_system_id=${encodeURIComponent(system)}`,
          surveyTemplatesResponseSchema,
          { signal },
        )
      ).data,
    enabled: enabled && Boolean(system),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}

export function useSurveyCopySources(system: string, search: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['survey-copy-sources', system, search],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({ managed_system_id: system, q: search.trim() });
      if (pageParam) query.set('cursor', pageParam);
      return (
        await apiRequest('GET', `/surveys/copy-sources?${query}`, surveyCopySourcesResponseSchema, {
          signal,
        })
      ).data;
    },
    getNextPageParam: (last) => (last.page.has_more ? last.page.cursor : undefined),
    enabled: enabled && Boolean(system),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}

export function useSurveyCopySource(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['survey-copy-source', id],
    queryFn: async ({ signal }) =>
      (
        await apiRequest('GET', `/surveys/${id}/copy-source`, surveyCopySourceResponseSchema, {
          signal,
        })
      ).data,
    enabled: enabled && Boolean(id),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}
