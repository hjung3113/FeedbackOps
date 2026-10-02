import { SurveyFollowUpRouteView } from '@/features/surveys/routes/SurveyFollowUpRoute';
import { WorkbenchShell } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/$surveyId/follow-up')({
  component: SurveyFollowUpFileRoute,
});

function SurveyFollowUpFileRoute() {
  const { surveyId } = Route.useParams();
  return (
    <WorkbenchShell>
      <div className="flex h-full min-h-0 flex-col">
        <SurveyFollowUpRouteView surveyId={surveyId} />
      </div>
    </WorkbenchShell>
  );
}
