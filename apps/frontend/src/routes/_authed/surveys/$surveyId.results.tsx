import { SurveyResultHeader } from '@/features/surveys/components/results/SurveyResultHeader';
import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useOutcomeFollowUp } from '@/features/surveys/hooks/useOutcomeFollowUp';
import { useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import { useSurveyReadGate } from '@/features/surveys/routes/SurveyPermissionGate';
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

  if (survey.isLoading || gate.gateState === 'loading') {
    return (
      <ResultsWorkbench>
        <div className="p-6 text-sm text-text-muted">불러오는 중…</div>
      </ResultsWorkbench>
    );
  }
  if (survey.isError || !survey.data) {
    return (
      <ResultsWorkbench>
        <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="설문을 찾을 수 없습니다." />
      </ResultsWorkbench>
    );
  }
  if (!gate.canRead) {
    return (
      <ResultsWorkbench>
        <div className="p-6">
          <PermissionBlockedPanel
            category="Survey Result"
            reason={PERMISSION_BLOCKED_REASONS.surveyResult}
            state="denied"
          />
        </div>
      </ResultsWorkbench>
    );
  }
  if (results.isLoading)
    return (
      <ResultsWorkbench>
        <div className="p-6 text-sm text-text-muted">결과를 불러오는 중…</div>
      </ResultsWorkbench>
    );
  if (results.isError || !results.data) {
    return (
      <ResultsWorkbench>
        <EmptyState body="결과를 불러올 수 없습니다." title="설문 결과를 찾을 수 없습니다." />
      </ResultsWorkbench>
    );
  }
  const followUp = survey.data.type === 'outcome' ? (followUpRead.data ?? null) : null;
  return (
    <ResultsWorkbench>
      <SurveyResultHeader activeTab="results" followUpRead={followUp} survey={survey.data} />
      <SurveyResultsSummary followUpRead={followUp} results={results.data} survey={survey.data} />
    </ResultsWorkbench>
  );
}

function ResultsWorkbench({ children }: { children: ReactNode }) {
  return (
    <WorkbenchShell>
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </WorkbenchShell>
  );
}
