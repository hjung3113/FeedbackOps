import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import { useSurveyReadGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { EmptyState, PermissionBlockedPanel } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/$surveyId/results')({
  component: SurveyResultsRoute,
});

export function SurveyResultsRoute() {
  const { surveyId } = Route.useParams();
  const survey = useSurvey(surveyId);
  const gate = useSurveyReadGate(survey.data?.primary_managed_system_id);
  const results = useSurveyResults(surveyId, gate.canRead);

  if (survey.isLoading || gate.gateState === 'loading') {
    return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  }
  if (survey.isError || !survey.data) {
    return (
      <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="설문을 찾을 수 없습니다." />
    );
  }
  if (!gate.canRead) {
    return (
      <div className="p-6">
        <PermissionBlockedPanel
          category="Survey Result"
          reason="설문 결과를 볼 권한이 없습니다."
          state="denied"
        />
      </div>
    );
  }
  if (results.isLoading)
    return <div className="p-6 text-sm text-text-muted">결과를 불러오는 중…</div>;
  if (results.isError || !results.data) {
    return <EmptyState body="결과를 불러올 수 없습니다." title="설문 결과를 찾을 수 없습니다." />;
  }
  return <SurveyResultsSummary results={results.data} survey={survey.data} />;
}
