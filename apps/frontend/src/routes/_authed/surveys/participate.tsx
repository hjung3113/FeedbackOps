import { SurveyParticipationPage } from '@/features/surveys/routes/SurveyParticipationPage';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/participate')({
  component: SurveyParticipationPage,
});
