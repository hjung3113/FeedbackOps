import { ListStateMessage } from '@/components/ListStateMessage';
import { ApiError, errorMapper } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import {
  SURVEY_PARTICIPATION_COPY,
  respondentIdentityNotice,
} from '@/lib/copy/survey-participation';
import { formatDate } from '@/lib/format/datetime';
import {
  type AnswerableSurveysResponse,
  type MySurveyResponsesResponse,
  type SurveyRespondentQuestion,
  type SurveyResponseSubmission,
  surveyResponseSubmissionSchema,
} from '@fops/shared';
import { Button, EmptyState, PageShell, Skeleton } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import {
  type RespondentAnswer,
  RespondentQuestion,
} from '../components/respond/RespondentQuestion';
import { getVisibleRespondentQuestions } from '../components/respond/branching';
import {
  useAnswerableSurveys,
  useMySurveyResponses,
  useSubmitSurveyResponse,
  useSurveyRespondentForm,
} from '../hooks/useSurveys';

export function SurveyParticipationPage() {
  const answerable = useAnswerableSurveys();
  const history = useMySurveyResponses();

  return (
    <PageShell contentClassName="max-w-5xl">
      <main className="space-y-8" data-testid="survey-participation-page">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            {SURVEY_PARTICIPATION_COPY.participate}
          </h1>
        </header>
        <section aria-labelledby="answerable-surveys-heading">
          <h2
            className="mb-3 text-sm font-semibold text-text-primary"
            id="answerable-surveys-heading"
          >
            {SURVEY_PARTICIPATION_COPY.answerableSurveys}
          </h2>
          <AnswerableSurveysRegion
            data={answerable.data?.items ?? []}
            isLoading={answerable.isPending}
            isError={answerable.isError}
            onRetry={() => void answerable.refetch()}
          />
        </section>
        <section aria-labelledby="survey-response-history-heading">
          <h2
            className="mb-3 text-sm font-semibold text-text-primary"
            id="survey-response-history-heading"
          >
            {SURVEY_PARTICIPATION_COPY.responseHistory}
          </h2>
          <SurveyResponseHistoryRegion
            data={history.data?.items ?? []}
            isLoading={history.isPending}
            isError={history.isError}
            onRetry={() => void history.refetch()}
          />
        </section>
      </main>
    </PageShell>
  );
}

function AnswerableSurveysRegion({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: AnswerableSurveysResponse['items'];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <ParticipationListLoading testId="participation-answerable-loading" />;
  }
  if (isError) {
    return (
      <ListStateMessage
        variant="error"
        title={SURVEY_PARTICIPATION_COPY.answerableLoadError}
        action={{ label: SURVEY_PARTICIPATION_COPY.retry, onClick: onRetry }}
      />
    );
  }
  if (data.length === 0) {
    return (
      <ListStateMessage variant="empty" title={SURVEY_PARTICIPATION_COPY.noAnswerableSurveys} />
    );
  }

  return (
    <ul className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
      {data.map((survey) => (
        <li key={survey.survey_id} className="border-b border-border-subtle last:border-b-0">
          <Link
            to="/surveys/$surveyId/respond"
            params={{ surveyId: survey.survey_id }}
            className="block px-4 py-3 hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="block text-sm font-medium text-text-primary">{survey.title}</span>
            <span className="mt-1 block text-xs text-text-muted">
              {survey.display_id} · {SURVEY_TYPE_LABELS[survey.type]} ·{' '}
              {SURVEY_PARTICIPATION_COPY.questionCount(survey.question_count)} ·{' '}
              {formatDate(survey.opened_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SurveyResponseHistoryRegion({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: MySurveyResponsesResponse['items'];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <ParticipationListLoading testId="participation-history-loading" />;
  }
  if (isError) {
    return (
      <ListStateMessage
        variant="error"
        title={SURVEY_PARTICIPATION_COPY.responseHistoryLoadError}
        action={{ label: SURVEY_PARTICIPATION_COPY.retry, onClick: onRetry }}
      />
    );
  }
  if (data.length === 0) {
    return <ListStateMessage variant="empty" title={SURVEY_PARTICIPATION_COPY.noSurveyResponses} />;
  }

  return (
    <ul className="overflow-hidden rounded-md border border-border-subtle bg-surface-card">
      {data.map((response) => (
        <li
          key={`${response.survey_id}-${response.submitted_at}`}
          className="border-b border-border-subtle px-4 py-3 last:border-b-0"
        >
          <span className="block text-sm font-medium text-text-primary">
            {response.survey_title}
          </span>
          <span className="mt-1 block text-xs text-text-muted">
            {formatDate(response.submitted_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ParticipationListLoading({ testId }: { testId: string }) {
  return (
    <section
      aria-label={SURVEY_PARTICIPATION_COPY.loading}
      aria-live="polite"
      aria-busy="true"
      className="space-y-2"
      data-testid={testId}
    >
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </section>
  );
}

export function RespondSurveyPage({ surveyId }: { surveyId: string }) {
  const form = useSurveyRespondentForm(surveyId);
  const submit = useSubmitSurveyResponse(surveyId);
  const [answers, setAnswers] = React.useState<Record<string, RespondentAnswer>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [validationSummary, setValidationSummary] = React.useState<string | null>(null);

  const allQuestions = form.data?.questions ?? [];
  const visibleQuestions = getVisibleRespondentQuestions(allQuestions, answers);
  const builtSubmission = buildSurveyResponseSubmission(visibleQuestions, answers);
  const payloadToken = JSON.stringify(builtSubmission.body);
  const { key: idempotencyKey } = useIdempotencyKey(payloadToken);

  if (form.isPending) {
    return (
      <PageShell contentClassName="flex min-h-full justify-center">
        <section
          aria-label={SURVEY_PARTICIPATION_COPY.loading}
          aria-live="polite"
          aria-busy="true"
          className="w-full max-w-xl pt-10"
        >
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="mt-6 h-28 w-full" />
        </section>
      </PageShell>
    );
  }
  if (form.isError || !form.data) {
    if (
      form.error instanceof ApiError &&
      form.error.status === 409 &&
      form.error.code === 'conflict.survey_not_open'
    ) {
      return <RespondentPageMessage message={errorMapper(form.error.envelope).message} />;
    }
    if (form.error instanceof ApiError && form.error.status === 404) {
      return (
        <PageShell contentClassName="flex min-h-full justify-center">
          <div className="w-full max-w-xl pt-10">
            <EmptyState
              title={SURVEY_PARTICIPATION_COPY.notFoundTitle}
              body={SURVEY_PARTICIPATION_COPY.notFoundBody}
            />
          </div>
        </PageShell>
      );
    }
    return (
      <PageShell contentClassName="flex min-h-full justify-center">
        <div className="w-full max-w-xl pt-10">
          <ListStateMessage
            variant="error"
            title={SURVEY_PARTICIPATION_COPY.formLoadError}
            action={{
              label: SURVEY_PARTICIPATION_COPY.retry,
              onClick: () => void form.refetch(),
            }}
          />
        </div>
      </PageShell>
    );
  }

  if (
    submit.error instanceof ApiError &&
    submit.error.status === 409 &&
    (submit.error.code === 'conflict.survey_not_open' ||
      submit.error.code === 'conflict.survey_response_already_submitted')
  ) {
    return <RespondentPageMessage message={errorMapper(submit.error.envelope).message} />;
  }
  if (submit.isSuccess) {
    return (
      <PageShell contentClassName="flex min-h-full justify-center">
        <section
          className="w-full max-w-xl pt-16 text-center"
          data-testid="survey-response-success"
        >
          <h1 className="text-lg font-semibold text-text-primary">
            {SURVEY_PARTICIPATION_COPY.submitted}
          </h1>
          <Link
            to="/surveys/participate"
            className="mt-5 inline-flex text-sm font-medium text-accent-primary underline"
          >
            {SURVEY_PARTICIPATION_COPY.backToParticipation}
          </Link>
        </section>
      </PageShell>
    );
  }

  const submitError =
    submit.isError && submit.error instanceof ApiError
      ? errorMapper(submit.error.envelope).message
      : null;
  const showSummary = submitError ?? validationSummary;

  return (
    <PageShell contentClassName="flex min-h-full justify-center">
      <main className="w-full max-w-xl py-8" data-testid="survey-respondent-page">
        <section
          className="rounded-md border border-border-subtle bg-surface-card p-6"
          data-testid="survey-respondent-form"
        >
          <header>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              {form.data.survey.title}
            </h1>
            <p className="mt-4 rounded bg-surface-detail p-3 text-sm text-text-secondary">
              {SURVEY_PARTICIPATION_COPY.anonymityNotice} ·{' '}
              {respondentIdentityNotice(form.data.survey.identity_protected)}
            </p>
          </header>
          <form
            className="mt-6 space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              const validation = buildSurveyResponseSubmission(visibleQuestions, answers);
              setFieldErrors(validation.errors);
              if (validation.body.answers.length === 0) {
                setValidationSummary(SURVEY_PARTICIPATION_COPY.noAnswers);
                return;
              }
              if (Object.keys(validation.errors).length > 0) {
                setValidationSummary(SURVEY_PARTICIPATION_COPY.validationSummary);
                return;
              }
              setValidationSummary(null);
              const body = surveyResponseSubmissionSchema.parse(validation.body);
              submit.mutate({ body, idempotencyKey });
            }}
          >
            {visibleQuestions.map((question) => (
              <div key={question.id}>
                <p className="text-sm font-medium text-text-primary">
                  Q{question.sort_order + 1}. {question.prompt}
                  {question.is_required && ' *'}
                </p>
                <RespondentQuestion
                  question={question}
                  value={answers[question.id]}
                  onChange={(value) => {
                    setAnswers((current) => ({ ...current, [question.id]: value }));
                    setValidationSummary(null);
                    setFieldErrors((current) => {
                      const { [question.id]: _removed, ...rest } = current;
                      return rest;
                    });
                    if (submit.isError) submit.reset();
                  }}
                />
                {fieldErrors[question.id] !== undefined && (
                  <p className="mt-1 text-sm text-accent-danger" role="alert">
                    {fieldErrors[question.id]}
                  </p>
                )}
              </div>
            ))}
            {showSummary !== null && (
              <p className="text-sm text-accent-danger" role="alert">
                {showSummary}
              </p>
            )}
            <div className="border-t border-border-subtle pt-4 text-right">
              <Button type="submit" disabled={submit.isPending}>
                {SURVEY_PARTICIPATION_COPY.submit}
              </Button>
            </div>
          </form>
        </section>
      </main>
    </PageShell>
  );
}

function RespondentPageMessage({ message }: { message: string }) {
  return (
    <PageShell contentClassName="flex min-h-full justify-center">
      <section className="w-full max-w-xl pt-16 text-center" role="alert">
        <p className="text-sm text-text-primary">{message}</p>
        <Link
          to="/surveys/participate"
          className="mt-5 inline-flex text-sm font-medium text-accent-primary underline"
        >
          {SURVEY_PARTICIPATION_COPY.backToParticipation}
        </Link>
      </section>
    </PageShell>
  );
}

function buildSurveyResponseSubmission(
  questions: SurveyRespondentQuestion[],
  answers: Record<string, RespondentAnswer>,
): { body: SurveyResponseSubmission; errors: Record<string, string> } {
  const submitted: SurveyResponseSubmission['answers'] = [];
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.id];
    if (!hasRespondentAnswer(question, value)) {
      if (question.is_required) errors[question.id] = SURVEY_PARTICIPATION_COPY.requiredAnswer;
      continue;
    }

    if (question.kind === 'text') {
      const text = (value as string).trim();
      if (Array.from(text).length > 4000) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.textTooLong;
        continue;
      }
      submitted.push({ question_id: question.id, value: text });
      continue;
    }
    if (question.kind === 'single_choice') {
      if (typeof value !== 'string' || !question.options?.some((option) => option.key === value)) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
        continue;
      }
      submitted.push({ question_id: question.id, value });
      continue;
    }
    if (question.kind === 'multiple_choice') {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        new Set(value).size !== value.length ||
        value.some((key) => !question.options?.some((option) => option.key === key))
      ) {
        errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
        continue;
      }
      submitted.push({ question_id: question.id, value });
      continue;
    }

    const minimum = question.rating_min ?? 1;
    const maximum = question.rating_max ?? 5;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      errors[question.id] = SURVEY_PARTICIPATION_COPY.invalidAnswer;
      continue;
    }
    submitted.push({ question_id: question.id, value });
  }

  return { body: { answers: submitted }, errors };
}

function hasRespondentAnswer(
  question: SurveyRespondentQuestion,
  value: RespondentAnswer | undefined,
) {
  if (value === undefined) return false;
  if (question.kind === 'text') return typeof value === 'string' && value.trim().length > 0;
  if (question.kind === 'multiple_choice') return Array.isArray(value) && value.length > 0;
  if (question.kind === 'single_choice') return typeof value === 'string' && value.length > 0;
  return typeof value === 'number';
}
