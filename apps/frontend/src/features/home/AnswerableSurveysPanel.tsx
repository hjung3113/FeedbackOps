import { ListStateMessage } from '@/components/ListStateMessage';
import { useAnswerableSurveys } from '@/features/surveys/hooks/useSurveys';
import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { SURVEY_PARTICIPATION_COPY } from '@/lib/copy/survey-participation';
import { formatDate } from '@/lib/format/datetime';
import { InternalLink } from '@/lib/router/InternalLink';
import { Button, SkeletonRows } from '@fops/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function AnswerableSurveysPanel() {
  const query = useAnswerableSurveys();
  const surveys = query.data?.pages[0]?.items ?? [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {SURVEY_PARTICIPATION_COPY.answerableSurveys}
        </h2>
        <SurveyParticipationLink className="text-xs text-text-secondary hover:text-text-primary">
          {SURVEY_PARTICIPATION_COPY.viewAllHome} <ArrowRight className="inline h-3 w-3" />
        </SurveyParticipationLink>
      </div>
      {query.isPending ? (
        <section
          aria-label={SURVEY_PARTICIPATION_COPY.loading}
          className="space-y-2 rounded-md border border-border-subtle bg-surface-card p-3"
          data-testid="home-answerable-surveys-loading"
          aria-live="polite"
          aria-busy="true"
        >
          <SkeletonRows count={2} size="compact" />
        </section>
      ) : query.isError && surveys.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-card px-4 py-3">
          <ListStateMessage
            variant="error"
            title={SURVEY_PARTICIPATION_COPY.answerableLoadError}
            action={{
              label: SURVEY_PARTICIPATION_COPY.retry,
              onClick: () => void query.refetch(),
            }}
          />
        </div>
      ) : surveys.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-card">
          <p className="px-4 py-5 text-sm text-text-muted">
            {SURVEY_PARTICIPATION_COPY.noAnswerableSurveys}
          </p>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
          data-testid="home-answerable-surveys-list"
        >
          {surveys.slice(0, 5).map((survey) => (
            <li key={survey.survey_id} className="border-b border-border-subtle last:border-b-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <SurveyParticipationLink
                  surveyId={survey.survey_id}
                  className="min-w-0 flex-1 rounded-sm hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <span className="block text-sm font-medium text-text-primary">
                    {survey.title}
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {survey.display_id} · {SURVEY_TYPE_LABELS[survey.type]} ·{' '}
                    {SURVEY_PARTICIPATION_COPY.questionCount(survey.question_count)} ·{' '}
                    {formatDate(survey.opened_at)}
                  </span>
                </SurveyParticipationLink>
                <Button asChild variant="primary" size="sm">
                  <SurveyParticipationLink surveyId={survey.survey_id} className="shrink-0">
                    {SURVEY_PARTICIPATION_COPY.respond}
                  </SurveyParticipationLink>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SurveyParticipationLink({
  surveyId,
  className,
  children,
}: {
  surveyId?: string;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter({ warn: false });
  const href = surveyId === undefined ? '/surveys/participate' : `/surveys/${surveyId}/respond`;

  if (!router)
    return (
      <InternalLink className={className} href={href}>
        {children}
      </InternalLink>
    );
  if (surveyId === undefined) {
    return (
      <Link to="/surveys/participate" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/surveys/$surveyId/respond" params={{ surveyId }} className={className}>
      {children}
    </Link>
  );
}
