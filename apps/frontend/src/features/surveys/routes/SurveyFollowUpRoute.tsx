import {
  OutcomeFollowUpReview,
  SurveyFollowUpUnavailable,
} from '@/features/surveys/components/results/OutcomeFollowUpReview';
import { SurveyResultHeader } from '@/features/surveys/components/results/SurveyResultHeader';
import { useOutcomeFollowUp } from '@/features/surveys/hooks/useOutcomeFollowUp';
import { useSurvey, useSurveyResults } from '@/features/surveys/hooks/useSurveys';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { Button, EmptyState, PermissionBlockedPanel } from '@fops/ui';
import { useSurveyReadGate } from './SurveyPermissionGate';

export function SurveyFollowUpRouteView({ surveyId }: { surveyId: string }) {
  const surveyQuery = useSurvey(surveyId);
  const gate = useSurveyReadGate(surveyQuery.data?.primary_managed_system_id);
  const canReadFollowUp =
    gate.canRead && surveyQuery.data?.type === 'outcome' && surveyQuery.data.status !== 'draft';
  const followUp = useOutcomeFollowUp(surveyId, canReadFollowUp);
  const canReadResults =
    gate.canRead && followUp.data?.classifiable === true && followUp.data.personal_access === true;
  const results = useSurveyResults(surveyId, canReadResults);
  useDocumentTitle(
    surveyQuery.isSuccess && !surveyQuery.isFetching && gate.canRead
      ? formatRecordDocumentTitle({
          displayId: surveyQuery.data.display_id,
          title: surveyQuery.data.title,
        })
      : null,
  );

  if (surveyQuery.isLoading || gate.gateState === 'loading') {
    return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  }
  if (surveyQuery.isError || !surveyQuery.data) {
    return (
      <EmptyState body="삭제되었거나 접근 권한이 없습니다." title="설문을 찾을 수 없습니다." />
    );
  }
  if (!gate.canRead) {
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

  if (surveyQuery.data.type !== 'outcome' || surveyQuery.data.status === 'draft') {
    return <SurveyFollowUpUnavailable survey={surveyQuery.data} />;
  }
  if (followUp.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SurveyResultHeader activeTab="follow-up" followUpRead={null} survey={surveyQuery.data} />
        <div className="p-6 text-sm text-text-muted">후속 검토를 불러오는 중…</div>
      </div>
    );
  }
  if (followUp.isError || !followUp.data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SurveyResultHeader activeTab="follow-up" followUpRead={null} survey={surveyQuery.data} />
        <EmptyState
          action={
            <Button onClick={() => void followUp.refetch()} type="button">
              다시 시도
            </Button>
          }
          body="잠시 후 다시 시도해 주세요."
          title="후속 검토를 불러오지 못했습니다."
        />
      </div>
    );
  }

  return (
    <OutcomeFollowUpReview
      followUpRead={followUp.data}
      results={results.data}
      resultsError={results.isError}
      resultsLoading={results.isLoading}
      survey={surveyQuery.data}
    />
  );
}
