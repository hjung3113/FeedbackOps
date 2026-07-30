import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import type { FindingSeverity, SurveyResultDto } from '@fops/shared';
import {
  Button,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { FilePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCreateFindingFromSurveyResponse } from '../../hooks/useCreateFindingFromSurveyResponse';
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

type ResponseExcerpt = { id: string; text: string; response_id: string };

function excerptsByResponse(results: SurveyResultDto): ResponseExcerpt[][] {
  const grouped = new Map<string, ResponseExcerpt[]>();
  for (const question of results.questions) {
    if (question.visibility !== 'visible') continue;
    if (question.kind !== 'text') continue;
    for (const excerpt of question.excerpts) {
      if (!excerpt.response_id) continue;
      const group = grouped.get(excerpt.response_id) ?? [];
      group.push({ ...excerpt, response_id: excerpt.response_id });
      grouped.set(excerpt.response_id, group);
    }
  }
  return [...grouped.values()];
}

function CreateFindingDraftPanel({
  surveyId,
  groups,
}: {
  surveyId: string;
  groups: ResponseExcerpt[][];
}) {
  const [selection, setSelection] = useState<{ responseId?: string; excerptIds: string[] }>({
    excerptIds: [],
  });
  const [severity, setSeverity] = useState<FindingSeverity>('medium');
  const mutation = useCreateFindingFromSurveyResponse(surveyId);
  const selectedGroup = groups.find((group) => group[0]?.response_id === selection.responseId);

  useEffect(() => {
    setSelection((current) => {
      if (!current.responseId) return current;
      if (!selectedGroup) return { excerptIds: [] };
      const excerptIds = current.excerptIds.filter((id) =>
        selectedGroup.some((excerpt) => excerpt.id === id),
      );
      return excerptIds.length === current.excerptIds.length ? current : { ...current, excerptIds };
    });
  }, [selectedGroup]);

  function selectResponse(nextResponseId: string) {
    setSelection({ responseId: nextResponseId, excerptIds: [] });
  }

  function setExcerptSelected(id: string, checked: boolean) {
    setSelection((current) => ({
      ...current,
      excerptIds: checked
        ? [...current.excerptIds, id]
        : current.excerptIds.filter((excerptId) => excerptId !== id),
    }));
  }

  function submit() {
    if (!selectedGroup || selection.excerptIds.length === 0) return;
    const first = selectedGroup[0];
    if (!first) return;
    mutation.mutate({
      responseId: first.response_id,
      body: { severity, approved_excerpt_ids: selection.excerptIds },
    });
  }

  return (
    <section
      className="mt-3 space-y-3 border-t border-border-subtle pt-3"
      data-testid="survey-create-finding-draft"
    >
      <p className="text-sm font-medium text-text-primary">Create or link Finding</p>
      <fieldset className="space-y-2">
        <legend className="text-sm text-text-secondary" id="survey-finding-response-label">
          Choose a response
        </legend>
        <RadioGroup
          aria-labelledby="survey-finding-response-label"
          onValueChange={selectResponse}
          value={selection.responseId ?? ''}
        >
          {groups.map((group, index) => {
            const first = group[0];
            if (!first) return null;
            return (
              <label
                className="flex items-center gap-2 text-sm text-text-secondary"
                key={first.response_id}
              >
                <RadioGroupItem
                  data-testid={`survey-finding-response-${index}`}
                  value={first.response_id}
                />
                Response {index + 1}
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>
      {selectedGroup && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-text-secondary">Approved excerpts</legend>
          {selectedGroup.map((excerpt) => (
            <label className="flex gap-2 text-sm text-text-secondary" key={excerpt.id}>
              <Checkbox
                checked={selection.excerptIds.includes(excerpt.id)}
                data-testid={`survey-finding-excerpt-${excerpt.id}`}
                onCheckedChange={(checked) => setExcerptSelected(excerpt.id, checked === true)}
              />
              <span>{excerpt.text}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="block text-sm text-text-secondary" id="survey-finding-severity-label">
        Severity
        <Select onValueChange={(value) => setSeverity(value as FindingSeverity)} value={severity}>
          <SelectTrigger
            aria-labelledby="survey-finding-severity-label"
            className="mt-1"
            data-testid="survey-finding-severity"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {mutation.error && (
        <p className="text-sm text-text-danger" role="alert">
          {mutation.error.message}
        </p>
      )}
      <Button
        data-testid="survey-create-finding-submit"
        disabled={!selectedGroup || selection.excerptIds.length === 0}
        loading={mutation.isPending}
        onClick={submit}
        type="button"
      >
        Create selected Finding
      </Button>
    </section>
  );
}

function NextActions({
  actions,
  results,
  surveyId,
}: {
  actions: SurveyResultDto['next_actions'];
  results: SurveyResultDto;
  surveyId: string;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const groups = excerptsByResponse(results);
  if (actions.length === 0) return null;

  return (
    <aside
      className="sticky top-4 self-start rounded-md border border-border-subtle bg-surface-raised p-4"
      data-testid="survey-result-next-actions"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        Follow-up actions
      </h2>
      <div className="mt-3 space-y-2">
        {actions.map((action) => {
          const label = action.id === 'create_finding' ? 'Create Finding' : 'Request Task';
          if (action.availability === 'blocked_requestable') {
            if (!action.requestable_permission) {
              return (
                <div className="space-y-1" data-action-id={action.id} key={action.id}>
                  <Button disabled type="button" variant="secondary">
                    Request access
                  </Button>
                  <p className="text-sm text-text-muted">
                    Access details are unavailable, so this request cannot be submitted.
                  </p>
                </div>
              );
            }
            return (
              <div data-action-id={action.id} key={action.id}>
                <RequestAccessButton
                  capability={action.requestable_permission.permission}
                  managedSystemId={action.requestable_permission.managed_system_id}
                />
              </div>
            );
          }
          if (action.id === 'create_finding') {
            const unavailable = groups.length === 0;
            return (
              <div
                className="space-y-1"
                data-testid="survey-result-action-create-finding"
                key={action.id}
              >
                <Button
                  className="w-full justify-start text-left"
                  data-action-id={action.id}
                  disabled={unavailable}
                  onClick={() => setDraftOpen(true)}
                  type="button"
                  variant="primary"
                >
                  <FilePlus aria-hidden className="h-4 w-4" />
                  {label}
                </Button>
                {unavailable && (
                  <p className="text-sm text-text-muted">
                    No approved excerpts are available for a response you can access.
                  </p>
                )}
                {draftOpen && <CreateFindingDraftPanel groups={groups} surveyId={surveyId} />}
              </div>
            );
          }
          return (
            <Button data-action-id={action.id} key={action.id} type="button" variant="secondary">
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
        <NextActions actions={results.next_actions} results={results} surveyId={survey.id} />
      </div>
    </main>
  );
}
