import { ListStateMessage } from '@/components/ListStateMessage';
import { SurveyResultHeader } from '@/features/surveys/components/results/SurveyResultHeader';
import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useOutcomeFollowUp } from '@/features/surveys/hooks/useOutcomeFollowUp';
import { surveyKeys, useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import { useSurveyReadGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { EmptyState, PermissionBlockedPanel, WorkbenchShell } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';

export const Route = createFileRoute('/_authed/surveys/$surveyId/results')({
  component: SurveyResultsRoute,
});

/**
 * An authoritative read denial for one Survey: a results 403 or denial-shaped
 * 404, or an outcome Follow-up 403 or denial-shaped 404. Stored under
 * `surveyKeys.resultsReadDenial(surveyId)` so it survives route remounts:
 * TanStack replaces a denial error with any later error (500 / network / 409)
 * while keeping cached data, and the sticky marker keeps pre-denial results
 * hidden until newer successful reads settle.
 */
interface SurveyReadDenial {
  at: number;
  blocked: boolean;
}

function observedReadDenial(error: unknown): { blocked: boolean } | undefined {
  if (isPermissionDenied(error)) {
    return { blocked: true };
  }
  if (error instanceof ApiError && error.status === 404 && error.code === 'not_found.record') {
    return { blocked: false };
  }
  return undefined;
}

/**
 * Merges the stored denial record with denial-shaped errors observed in this
 * render. Pure: used both for the synchronous effective denial during render
 * and for the persistence effect, which re-merges against the latest stored
 * record. Monotonic in `at` and `blocked`: an older observation never lowers
 * the barrier, and a 403 keeps its stronger copy over a later 404.
 */
function mergeReadDenials(
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

export function SurveyResultsRoute() {
  const { surveyId } = Route.useParams();
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

  // Authoritative denials are sticky: once observed, response-derived data
  // stays hidden until a newer successful results read settles (and, for an
  // outcome Survey, a newer successful Follow-up read) — an ordinary later
  // error replaces the denial error in TanStack state and must not reveal
  // pre-denial data. The record lives in the query cache
  // (`surveyKeys.resultsReadDenial(surveyId)`) so it also survives route
  // remounts, and its key family is registered with `gcTime: Infinity` at
  // client setup (`registerSurveyQueryDefaults`) so it is never collected
  // while the results and Follow-up payloads are still cached.
  //
  // Observation must not depend on the metadata/gate early returns below: a
  // denial that arrives while the Survey metadata is in an ordinary error or
  // the gate is unavailable still has to be recorded, or the denial error can
  // later be replaced before the outer state recovers. The effective denial
  // is therefore derived synchronously (stored record + current errors)
  // before every early return, so the first denial frame already hides all
  // response-derived data; the effect only persists the merged record.
  const denialKey = surveyKeys.resultsReadDenial(surveyId);
  const storedDenial = queryClient.getQueryData<SurveyReadDenial>(denialKey) ?? null;
  const observedDenials: SurveyReadDenial[] = [];
  const resultsDenial = observedReadDenial(results.error);
  if (resultsDenial) {
    // `?? 0` also covers mocked hook results without timestamps in tests.
    observedDenials.push({ at: results.errorUpdatedAt ?? 0, blocked: resultsDenial.blocked });
  }
  if (survey.data?.type === 'outcome') {
    const followUpDenial = observedReadDenial(followUpRead.error);
    if (followUpDenial) {
      observedDenials.push({
        at: followUpRead.errorUpdatedAt ?? 0,
        blocked: followUpDenial.blocked,
      });
    }
  }
  const denial = mergeReadDenials(storedDenial, observedDenials);
  useEffect(() => {
    if (observedDenials.length === 0) return;
    // Merge against the latest stored record: another mount may have
    // advanced it between this render and this effect.
    const stored = queryClient.getQueryData<SurveyReadDenial>(denialKey) ?? null;
    const merged = mergeReadDenials(stored, observedDenials);
    if (merged === null) return;
    const changed = stored === null || merged.at !== stored.at || merged.blocked !== stored.blocked;
    if (changed) {
      // Persisted in the query cache so the denial also survives route remounts.
      queryClient.setQueryData(denialKey, merged);
    }
  });

  if (isPermissionDenied(survey.error)) {
    return (
      <ResultsWorkbench>
        <SurveyPermissionDeniedState />
      </ResultsWorkbench>
    );
  }
  if (survey.isError) {
    if (survey.error instanceof ApiError && survey.error.status === 404) {
      return (
        <ResultsWorkbench>
          <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="설문을 찾을 수 없습니다." />
        </ResultsWorkbench>
      );
    }
    return (
      <ResultsWorkbench>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <ListStateMessage
            variant="error"
            title="설문을 불러오지 못했습니다."
            body={mapUnknownError(survey.error).message}
            action={{
              label: '다시 시도',
              onClick: () => {
                void survey.refetch();
              },
            }}
          />
        </div>
      </ResultsWorkbench>
    );
  }
  if (survey.isLoading || gate.gateState === 'loading') {
    return (
      <ResultsWorkbench>
        <div className="p-6 text-sm text-text-muted">불러오는 중…</div>
      </ResultsWorkbench>
    );
  }
  if (!survey.data) {
    return (
      <ResultsWorkbench>
        <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="설문을 찾을 수 없습니다." />
      </ResultsWorkbench>
    );
  }
  if (!gate.canRead) {
    return (
      <ResultsWorkbench>
        <SurveyPermissionDeniedState />
      </ResultsWorkbench>
    );
  }
  const denialRecovered =
    denial !== null &&
    results.dataUpdatedAt > denial.at &&
    (survey.data.type !== 'outcome' || followUpRead.dataUpdatedAt > denial.at);
  const activeDenial = denial !== null && !denialRecovered ? denial : null;
  const followUpReadDenied =
    survey.data.type === 'outcome' &&
    (isPermissionDenied(followUpRead.error) ||
      (followUpRead.error instanceof ApiError &&
        followUpRead.error.status === 404 &&
        followUpRead.error.code === 'not_found.record'));
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
    survey.data.type === 'outcome' && followUpRead.isSuccess && !resultsReadUnavailable
      ? (followUpRead.data ?? null)
      : null;
  let resultsContent: ReactNode;
  if (resultsPermissionDenied) {
    resultsContent = <SurveyPermissionDeniedState />;
  } else if (resultsNotFound) {
    resultsContent = (
      <EmptyState body="결과를 불러올 수 없습니다." title="설문 결과를 찾을 수 없습니다." />
    );
  } else if (results.isLoading) {
    resultsContent = <div className="p-6 text-sm text-text-muted">결과를 불러오는 중…</div>;
  } else if (results.isError || !results.data) {
    resultsContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <ListStateMessage
          variant="error"
          title="결과를 불러오지 못했습니다."
          body={mapUnknownError(results.error).message}
          action={{
            label: '다시 시도',
            onClick: () => {
              void results.refetch();
            },
          }}
        />
      </div>
    );
  } else {
    resultsContent = (
      <SurveyResultsSummary followUpRead={followUp} results={results.data} survey={survey.data} />
    );
  }
  return (
    <ResultsWorkbench ariaLive={results.isSuccess ? 'off' : 'polite'}>
      <SurveyResultHeader activeTab="results" followUpRead={followUp} survey={survey.data} />
      {resultsContent}
    </ResultsWorkbench>
  );
}

function SurveyPermissionDeniedState() {
  return (
    <div className="p-6">
      <PermissionBlockedPanel
        category="Survey Result"
        reason={PERMISSION_BLOCKED_REASONS.surveyResult}
        state="denied"
      />
    </div>
  );
}

function ResultsWorkbench({
  children,
  ariaLive = 'polite',
}: {
  children: ReactNode;
  ariaLive?: 'off' | 'polite';
}) {
  return (
    <WorkbenchShell>
      <div aria-live={ariaLive} className="flex h-full min-h-0 flex-col">
        {children}
      </div>
    </WorkbenchShell>
  );
}
