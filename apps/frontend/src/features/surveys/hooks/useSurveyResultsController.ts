import { useOutcomeFollowUp } from '@/features/surveys/hooks/useOutcomeFollowUp';
import { surveyKeys, useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import {
  type SurveyReadDenial,
  mergeSurveyReadDenials,
  projectSurveyReadDenial,
  projectSurveyResultsRead,
} from '@/features/surveys/policy/resultsReadDenial';
import { useSurveyReadGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useSurveyResultsController(surveyId: string) {
  const queryClient = useQueryClient();
  const survey = useSurvey(surveyId);
  const gate = useSurveyReadGate(survey.data?.primary_managed_system_id);
  const results = useSurveyResults(surveyId, gate.canRead);
  const followUpRead = useOutcomeFollowUp(
    surveyId,
    gate.canRead && survey.data?.type === 'outcome',
  );
  useDocumentTitle(
    survey.isSuccess && !survey.isFetching && gate.canRead
      ? formatRecordDocumentTitle({
          displayId: survey.data.display_id,
          title: survey.data.title,
        })
      : null,
  );

  // Observe read errors synchronously so the first denial frame stays safe,
  // including when metadata or the capability gate takes an outer return.
  const denialKey = surveyKeys.resultsReadDenial(surveyId);
  const storedDenial = queryClient.getQueryData<SurveyReadDenial>(denialKey) ?? null;
  const observedDenials: SurveyReadDenial[] = [];
  const resultsDenial = projectSurveyReadDenial(results.error, results.errorUpdatedAt ?? 0);
  if (resultsDenial) observedDenials.push(resultsDenial);
  if (survey.data?.type === 'outcome') {
    const followUpDenial = projectSurveyReadDenial(
      followUpRead.error,
      followUpRead.errorUpdatedAt ?? 0,
    );
    if (followUpDenial) observedDenials.push(followUpDenial);
  }
  const denial = mergeSurveyReadDenials(storedDenial, observedDenials);

  useEffect(() => {
    if (observedDenials.length === 0) return;
    // Merge against the latest marker so another mount cannot advance it between render and effect.
    const stored = queryClient.getQueryData<SurveyReadDenial>(denialKey) ?? null;
    const merged = mergeSurveyReadDenials(stored, observedDenials);
    if (merged === null) return;
    const changed = stored === null || merged.at !== stored.at || merged.blocked !== stored.blocked;
    if (changed) queryClient.setQueryData(denialKey, merged);
  });

  const projection = projectSurveyResultsRead({
    surveyType: survey.data?.type,
    denial,
    results,
    followUpRead,
  });

  return {
    survey,
    gate,
    content: projection.content,
    followUp: projection.followUp,
    resultsAreSuccessful: results.isSuccess,
    refetchResults: results.refetch,
  };
}
