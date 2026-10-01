import { ListStateMessage } from '@/components/ListStateMessage';
import { SurveyResultHeader } from '@/features/surveys/components/results/SurveyResultHeader';
import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useOutcomeFollowUp } from '@/features/surveys/hooks/useOutcomeFollowUp';
import { useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import { useSurveyReadGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { EmptyState, PermissionBlockedPanel, WorkbenchShell } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

export const Route = createFileRoute('/_authed/surveys/$surveyId/results')({
  component: SurveyResultsRoute,
});

export function SurveyResultsRoute() {
  const { surveyId } = Route.useParams();
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
    isPermissionDenied(results.error) ||
    (followUpReadDenied && isPermissionDenied(followUpRead.error));
  const resultsNotFound =
    (results.error instanceof ApiError && results.error.status === 404) || followUpReadNotFound;
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
