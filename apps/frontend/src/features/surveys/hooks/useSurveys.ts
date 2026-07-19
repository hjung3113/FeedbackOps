import { apiClient } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionInput, Survey } from "../types";

export const surveyKeys = {
  list: ["surveys"] as const,
  detail: (id: string) => ["surveys", id] as const,
};

export function useSurveys() {
  return useQuery({
    queryKey: surveyKeys.list,
    queryFn: async ({ signal }) =>
      (await apiClient<Survey[]>("GET", "/surveys", { signal })).data,
    retry: 1,
  });
}

export function useSurvey(id: string) {
  return useQuery({
    queryKey: surveyKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await apiClient<Survey>("GET", `/surveys/${id}`, { signal })).data,
    enabled: Boolean(id),
    retry: false,
  });
}

function useQuestionMutation(
  method: "POST" | "PATCH" | "DELETE",
  surveyId: string,
  questionId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body?: QuestionInput) => {
      const suffix = questionId ? `/questions/${questionId}` : "/questions";
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
export const useCreateSurveyQuestion = (surveyId: string) =>
  useQuestionMutation("POST", surveyId);
export const useUpdateSurveyQuestion = (surveyId: string, questionId: string) =>
  useQuestionMutation("PATCH", surveyId, questionId);
export const useDeleteSurveyQuestion = (surveyId: string, questionId: string) =>
  useQuestionMutation("DELETE", surveyId, questionId);

export function useSurveyQuestionMutations(surveyId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: surveyKeys.detail(surveyId),
    });
  const create = useMutation({
    mutationFn: async (body: QuestionInput) =>
      (
        await apiClient<SurveyQuestionResponse>(
          "POST",
          `/surveys/${surveyId}/questions`,
          { body },
        )
      ).data,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: QuestionInput }) =>
      (
        await apiClient<SurveyQuestionResponse>(
          "PATCH",
          `/surveys/${surveyId}/questions/${id}`,
          { body },
        )
      ).data,
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      (
        await apiClient<SurveyQuestionResponse>(
          "DELETE",
          `/surveys/${surveyId}/questions/${id}`,
        )
      ).data,
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
