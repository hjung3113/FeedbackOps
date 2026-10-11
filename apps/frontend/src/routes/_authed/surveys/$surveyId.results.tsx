import { ListStateMessage } from '@/components/ListStateMessage';
import { SurveyResultHeader } from '@/features/surveys/components/results/SurveyResultHeader';
import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useSurveyResultsController } from '@/features/surveys/hooks/useSurveyResultsController';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError, isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { EmptyState, PermissionBlockedPanel, WorkbenchShell } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check), so the route component is not exported.
// Nothing imports SurveyResultsRoute. Route itself must stay exported — the
// route generator drops files whose Route is not exported.
export const Route = createFileRoute('/_authed/surveys/$surveyId/results')({
  component: SurveyResultsRoute,
});

function SurveyResultsRoute() {
  const { surveyId } = Route.useParams();
  const { survey, gate, content, followUp, resultsAreSuccessful, refetchResults } =
    useSurveyResultsController(surveyId);

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
          <EmptyState
            body="삭제되었거나 접근 권한이 없습니다."
            title="Survey를 찾을 수 없습니다."
          />
        </ResultsWorkbench>
      );
    }
    return (
      <ResultsWorkbench>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <ListStateMessage
            variant="error"
            title="Survey를 불러오지 못했습니다."
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
        <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="Survey를 찾을 수 없습니다." />
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

  let resultsContent: ReactNode;
  switch (content.kind) {
    case 'permission-denied':
      resultsContent = <SurveyPermissionDeniedState />;
      break;
    case 'not-found':
      resultsContent = (
        <EmptyState body="결과를 불러올 수 없습니다." title="Survey 결과를 찾을 수 없습니다." />
      );
      break;
    case 'loading':
      resultsContent = <div className="p-6 text-sm text-text-muted">결과를 불러오는 중…</div>;
      break;
    case 'error':
      resultsContent = (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <ListStateMessage
            variant="error"
            title="결과를 불러오지 못했습니다."
            body={mapUnknownError(content.error).message}
            action={{
              label: '다시 시도',
              onClick: () => {
                void refetchResults();
              },
            }}
          />
        </div>
      );
      break;
    case 'ready':
      resultsContent = (
        <SurveyResultsSummary
          followUpRead={followUp}
          results={content.results}
          survey={survey.data}
        />
      );
      break;
  }

  return (
    <ResultsWorkbench ariaLive={resultsAreSuccessful ? 'off' : 'polite'}>
      <SurveyResultHeader activeTab="results" followUpRead={followUp} survey={survey.data} />
      {resultsContent}
    </ResultsWorkbench>
  );
}

function SurveyPermissionDeniedState() {
  return (
    <div className="p-6">
      <PermissionBlockedPanel
        category="Survey 결과"
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
