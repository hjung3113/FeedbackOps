import { ApiError, isPermissionDenied } from '@/lib/api/types';
import type { QueryClient } from '@tanstack/react-query';

export interface SurveyReadDenial {
  at: number;
  blocked: boolean;
}

/** Per-Survey marker keys; the marker carries no response data. */
export const surveyResultsReadDenialKeys = {
  prefix: ['surveys', 'results-read-denial'] as const,
  bySurvey: (surveyId: string) => ['surveys', 'results-read-denial', surveyId] as const,
};

export function registerSurveyQueryDefaults(queryClient: QueryClient): void {
  queryClient.setQueryDefaults(surveyResultsReadDenialKeys.prefix, {
    gcTime: Number.POSITIVE_INFINITY,
  });
}

/** Only authoritative denials enter the sticky barrier; ordinary errors do not. */
export function projectSurveyReadDenial(error: unknown, at: number): SurveyReadDenial | undefined {
  if (isPermissionDenied(error)) {
    return { at, blocked: true };
  }
  if (error instanceof ApiError && error.status === 404 && error.code === 'not_found.record') {
    return { at, blocked: false };
  }
  return undefined;
}

/** Keeps timestamps monotonic and preserves stronger 403 copy over a later 404. */
export function mergeSurveyReadDenials(
  stored: SurveyReadDenial | null,
  observed: SurveyReadDenial[],
): SurveyReadDenial | null {
  let denial = stored;
  for (const next of observed) {
    if (denial === null || next.at > denial.at || (next.blocked && !denial.blocked)) {
      denial = {
        at: Math.max(denial?.at ?? next.at, next.at),
        blocked: (denial?.blocked ?? false) || next.blocked,
      };
    }
  }
  return denial;
}

export interface SurveyReadQuery<T> {
  data: T | undefined;
  dataUpdatedAt: number;
  error: unknown;
  errorUpdatedAt: number;
  isError: boolean;
  isLoading: boolean;
  isSuccess: boolean;
}

export type SurveyResultsReadContent<T> =
  | { kind: 'permission-denied' }
  | { kind: 'not-found' }
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; results: T };

/** Hides retained results until both newer required reads recover after a denial. */
export function projectSurveyResultsRead<TResults, TFollowUp>({
  surveyType,
  denial,
  results,
  followUpRead,
}: {
  surveyType: string | undefined;
  denial: SurveyReadDenial | null;
  results: SurveyReadQuery<TResults>;
  followUpRead: SurveyReadQuery<TFollowUp>;
}): { content: SurveyResultsReadContent<TResults>; followUp: TFollowUp | null } {
  const denialRecovered =
    denial !== null &&
    results.dataUpdatedAt > denial.at &&
    (surveyType !== 'outcome' || followUpRead.dataUpdatedAt > denial.at);
  const activeDenial = denial !== null && !denialRecovered ? denial : null;
  const observedFollowUpDenial = projectSurveyReadDenial(
    followUpRead.error,
    followUpRead.errorUpdatedAt ?? 0,
  );
  const followUpReadDenied = surveyType === 'outcome' && observedFollowUpDenial !== undefined;
  const followUpReadNotFound =
    followUpReadDenied &&
    followUpRead.error instanceof ApiError &&
    followUpRead.error.status === 404;
  const resultsPermissionDenied =
    activeDenial?.blocked === true ||
    isPermissionDenied(results.error) ||
    (followUpReadDenied && isPermissionDenied(followUpRead.error));
  const resultsNotFound =
    (activeDenial !== null && !activeDenial.blocked) ||
    (results.error instanceof ApiError && results.error.status === 404) ||
    followUpReadNotFound;
  const resultsReadUnavailable = resultsPermissionDenied || resultsNotFound;
  const followUp =
    surveyType === 'outcome' && followUpRead.isSuccess && !resultsReadUnavailable
      ? (followUpRead.data ?? null)
      : null;

  if (resultsPermissionDenied) return { content: { kind: 'permission-denied' }, followUp };
  if (resultsNotFound) return { content: { kind: 'not-found' }, followUp };
  if (results.isLoading) return { content: { kind: 'loading' }, followUp };
  if (results.isError || !results.data) {
    return { content: { kind: 'error', error: results.error }, followUp };
  }
  return { content: { kind: 'ready', results: results.data }, followUp };
}
