import { RespondSurveyPage } from '@/features/surveys/routes/SurveyParticipationPage';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/$surveyId/respond')({
  component: RespondSurveyRoute,
});

function RespondSurveyRoute() {
  const { surveyId } = Route.useParams();
  return <RespondSurveyPage surveyId={surveyId} />;
}
