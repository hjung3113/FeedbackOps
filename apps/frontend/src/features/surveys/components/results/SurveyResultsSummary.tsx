import { Button } from '@fops/ui';
import type { SurveyResultDto } from '@fops/shared';
import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import type { Survey } from '../../types';

export interface SurveyResultsSummaryProps {
  survey: Survey;
  results: SurveyResultDto;
}

function questionPrompt(survey: Survey, questionId: string): string {
  return survey.questions?.find((question) => question.id === questionId)?.prompt ?? 'Question';
}

function QuestionResult({
  survey,
  result,
  index,
}: {
  survey: Survey;
  result: SurveyResultDto['questions'][number];
  index: number;
}) {
  if (result.visibility === 'suppressed') {
    return (
      <section
        className="rounded-md border border-border-subtle bg-surface-raised p-4"
        data-testid={`survey-result-suppressed-${result.question_id}`}
      >
        <p className="text-sm font-medium text-text-primary">Q{index + 1}</p>
        <p className="mt-2 text-sm text-text-muted">Results are suppressed to protect anonymity.</p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <span>Q{index + 1}</span>
        <span className="rounded border border-border-subtle px-1.5 py-0.5 text-xs capitalize">
          {result.kind}
        </span>
        <span>{result.answer_count} responses</span>
      </div>
      <h2 className="mt-2 text-base font-semibold text-text-primary">
        {questionPrompt(survey, result.question_id)}
      </h2>
      {result.kind === 'choice' && (
        <ul className="mt-4 space-y-2" aria-label="Response distribution">
          {result.option_buckets.map((bucket) => (
            <li className="flex items-center justify-between gap-4 text-sm" key={bucket.key}>
              <span className="text-text-secondary">{bucket.label}</span>
              <span className="font-medium tabular-nums text-text-primary">{bucket.count}</span>
            </li>
          ))}
        </ul>
      )}
      {result.kind === 'rating' && (
        <dl className="mt-4 grid grid-cols-3 gap-2" aria-label="Rating distribution">
          {(['low', 'mid', 'high'] as const).map((band) => (
            <div className="rounded bg-surface-card p-3" key={band}>
              <dt className="text-xs capitalize text-text-muted">{band}</dt>
              <dd className="mt-1 font-medium tabular-nums text-text-primary">
                {result.distribution[band]}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {result.kind === 'text' && (
        <div className="mt-4 space-y-2">
          {result.excerpts.length === 0 ? (
            <p className="text-sm text-text-muted">No approved excerpts are available.</p>
          ) : (
            result.excerpts.map((excerpt) => (
              <blockquote
                className="border-l-2 border-border-selected pl-3 text-sm text-text-secondary"
                key={excerpt.id}
              >
                {excerpt.text}
              </blockquote>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function NextActions({ actions }: { actions: SurveyResultDto['next_actions'] }) {
  if (actions.length === 0) return null;

  return (
    <aside
      className="rounded-md border border-border-subtle bg-surface-raised p-4"
      data-testid="survey-result-next-actions"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        Follow-up actions
      </h2>
      <div className="mt-3 space-y-2">
        {actions.map((action) => {
          const label = action.id === 'create_finding' ? 'Create Finding' : 'Request Task';
          if (action.availability === 'blocked_requestable') {
            if (!action.requestable_permission) return null;
            return (
              <div data-action-id={action.id} key={action.id}>
                <RequestAccessButton
                  capability={action.requestable_permission.permission}
                  managedSystemId={action.requestable_permission.managed_system_id}
                />
              </div>
            );
          }
          return (
            <Button
              data-action-id={action.id}
              key={action.id}
              type="button"
              variant={action.id === 'create_finding' ? 'primary' : 'secondary'}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

export function SurveyResultsSummary({ survey, results }: SurveyResultsSummaryProps) {
  // The aggregate DTO has no outcome score or poor-result flag. Keep this
  // annotation tied to backend-provided follow-up availability rather than
  // deriving a poor outcome from response distributions.
  const hasOutcomeFollowUp = survey.type === 'outcome' && results.next_actions.length > 0;

  return (
    <main className="mx-auto max-w-6xl p-6" data-testid="survey-results-summary">
      <header className="border-b border-border-subtle pb-5">
        <p className="text-sm text-text-muted">{survey.display_id}</p>
        <h1 className="mt-1 text-xl font-semibold text-text-primary">{survey.title}</h1>
        <p className="mt-2 text-sm text-text-muted">
          Question summaries and response distributions
        </p>
        {results.identity_protected && (
          <p className="mt-3 text-sm text-text-muted">Identity protected responses</p>
        )}
        {hasOutcomeFollowUp && (
          <p className="mt-3 rounded-md border border-accent-danger/30 bg-surface-card p-3 text-sm text-text-primary">
            Outcome follow-up is available
          </p>
        )}
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {results.questions.map((result, index) => (
            <QuestionResult
              index={index}
              key={result.question_id}
              result={result}
              survey={survey}
            />
          ))}
        </div>
        <NextActions actions={results.next_actions} />
      </div>
    </main>
  );
}
