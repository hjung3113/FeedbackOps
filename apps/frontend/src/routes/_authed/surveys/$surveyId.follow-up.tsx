import { SurveyFollowUpRouteView } from '@/features/surveys/routes/SurveyFollowUpRoute';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/$surveyId/follow-up')({
  component: SurveyFollowUpFileRoute,
});

function SurveyFollowUpFileRoute() {
  const { surveyId } = Route.useParams();
  return <SurveyFollowUpRouteView surveyId={surveyId} />;
}
