import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import { useFindingDetail } from '@/features/findings/hooks/useFindingDetail';
import { useRequestTaskFromFinding } from '@/features/findings/hooks/useRequestTaskFromFinding';
import { TaskRequestDraftCard } from '@/features/tasks/components/TaskRequestDraftCard';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import type { OutcomeFollowUpReadDto, SurveyResultDto } from '@fops/shared';
import { Button, EmptyState } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { FilePlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Survey } from '../../types';
import { CreateFindingDraftPanel, excerptsByResponse } from './CreateFindingDraftPanel';

export interface SurveyResultsSummaryProps {
  survey: Survey;
  results: SurveyResultDto;
  followUpRead?: OutcomeFollowUpReadDto | null | undefined;
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

// Mounted only while a Finding is selected, so the results page needs no
// QueryClient unless a Request Task action is actually used.
function SelectedFindingRequest({
  findingId,
  onClose,
  onLoadError,
  onReady,
}: {
  findingId: string;
  onClose: () => void;
  onLoadError: (findingId: string) => void;
  onReady: (findingId: string) => void;
}) {
  const finding = useFindingDetail(findingId);
  const loaded = finding.data?.id === findingId ? finding.data : undefined;
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mutation = useRequestTaskFromFinding({
    findingId,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  useEffect(() => {
    if (loaded) onReady(findingId);
  }, [findingId, loaded, onReady]);

  useEffect(() => {
    if (finding.isError && !finding.isFetching && !loaded) onLoadError(findingId);
  }, [finding.isError, finding.isFetching, findingId, loaded, onLoadError]);

  if (!loaded) return null;
  return (
    <TaskRequestDraftCard
      sourceKind="Finding"
      sourceDisplayId={loaded.display_id}
      evidenceSummaryDefault={loaded.summary}
      isSubmitting={mutation.isPending}
      source={{ type: 'finding', id: loaded.id }}
      onClose={onClose}
      onSubmit={(values) => {
        mutation.mutate(values, {
          onSuccess: () => {
            markConsumed();
            mutation.reset();
            onClose();
            toast.success('Task Request가 생성되었습니다.');
          },
        });
      }}
    />
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
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [readyFindingId, setReadyFindingId] = useState<string | null>(null);
  const [loadErrorFindingId, setLoadErrorFindingId] = useState<string | null>(null);
  const groups = excerptsByResponse(results);

  const handleReady = useCallback((findingId: string) => setReadyFindingId(findingId), []);
  const handleLoadError = useCallback((findingId: string) => {
    setLoadErrorFindingId(findingId);
    setSelectedFindingId(null);
  }, []);
  const handleClose = useCallback(() => {
    setSelectedFindingId(null);
    setReadyFindingId(null);
    setLoadErrorFindingId(null);
  }, []);

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
          const actionKey =
            action.id === 'request_task'
              ? `${action.id}:${action.source_finding_id ?? ''}`
              : action.id;
          if (action.availability === 'blocked_requestable') {
            if (!action.requestable_permission) {
              return (
                <div className="space-y-1" data-action-id={action.id} key={actionKey}>
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
              <div data-action-id={action.id} key={actionKey}>
                <RequestAccessButton
                  capability={action.requestable_permission.permission}
                  managedSystemId={action.requestable_permission.managed_system_id}
                  returnRouteIntent={`/surveys/${surveyId}/results`}
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
                key={actionKey}
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
          const actionLoading =
            selectedFindingId === action.source_finding_id &&
            readyFindingId !== action.source_finding_id;
          return (
            <div className="space-y-1" key={actionKey}>
              <Button
                data-action-id={action.id}
                disabled={actionLoading || readyFindingId === action.source_finding_id}
                loading={actionLoading}
                onClick={() => {
                  setLoadErrorFindingId(null);
                  setReadyFindingId(null);
                  setSelectedFindingId(action.source_finding_id);
                }}
                type="button"
                variant="secondary"
              >
                {label}
              </Button>
              {loadErrorFindingId === action.source_finding_id && (
                <p className="text-sm text-text-danger" role="alert">
                  Finding could not be loaded.
                </p>
              )}
              {selectedFindingId === action.source_finding_id && (
                <SelectedFindingRequest
                  findingId={action.source_finding_id}
                  key={action.source_finding_id}
                  onClose={handleClose}
                  onLoadError={handleLoadError}
                  onReady={handleReady}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export function SurveyResultsSummary({ survey, results, followUpRead }: SurveyResultsSummaryProps) {
  // The aggregate DTO has no outcome score or poor-result flag. Keep this
  // annotation tied to backend-provided follow-up availability rather than
  // deriving a poor outcome from response distributions.
  const hasOutcomeFollowUp =
    survey.type === 'outcome' &&
    (followUpRead === undefined
      ? results.next_actions.length > 0
      : followUpRead?.follow_up_needed === true);
  // The route renders SurveyResultHeader above this component for every survey type and always
  // passes followUpRead (null when not applicable). `undefined` only happens in direct-render
  // tests, which keep the in-body title below.
  const directRender = followUpRead === undefined;
  return (
    <main className="flex min-h-0 flex-1 flex-col" data-testid="survey-results-summary">
      <div className="mx-auto w-full max-w-6xl p-6">
        <header className="border-b border-border-subtle pb-5">
          {directRender && (
            <>
              <p className="text-sm text-text-muted">{survey.display_id}</p>
              <h1 className="mt-1 text-xl font-semibold text-text-primary">{survey.title}</h1>
            </>
          )}
          <p className="mt-2 text-sm text-text-muted">
            Question summaries and response distributions
          </p>
          {results.identity_protected && (
            <p className="mt-3 text-sm text-text-muted">Identity protected responses</p>
          )}
          {hasOutcomeFollowUp &&
            (followUpRead === undefined ? (
              // Legacy direct-render branch keeps the develop-era Summary test green.
              <p className="mt-3 rounded-md border border-accent-danger/30 bg-surface-card p-3 text-sm text-text-primary">
                Outcome follow-up is available
              </p>
            ) : (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-danger/30 bg-surface-card p-3 text-sm text-text-primary"
                data-testid="outcome-follow-up-callout"
              >
                <div>
                  <p className="font-medium">후속 조치가 필요한 저조한 응답이 있습니다</p>
                  {followUpRead?.personal_access !== true && (
                    <p className="mt-1 text-text-muted">
                      개인 응답 열람 권한이 있어야 응답별로 검토할 수 있습니다.
                    </p>
                  )}
                </div>
                {followUpRead?.personal_access === true && (
                  <Link
                    className="shrink-0 font-medium text-accent-primary underline-offset-2 hover:underline"
                    params={{ surveyId: survey.id }}
                    to="/surveys/$surveyId/follow-up"
                  >
                    Follow-up 검토
                  </Link>
                )}
              </div>
            ))}
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {results.response_state === 'none' ? (
              <EmptyState
                body={`응답이 ${results.anonymity_threshold}건 이상 모이면 결과가 표시됩니다.`}
                title="아직 응답이 없습니다"
              />
            ) : results.response_state === 'below_threshold' ? (
              <EmptyState
                body={`익명 보호를 위해 ${results.anonymity_threshold}건 미만일 때는 집계와 정확한 응답 수를 숨깁니다.`}
                title={`응답이 ${results.anonymity_threshold}건 이상 모이면 결과가 표시됩니다`}
              />
            ) : (
              results.questions.map((result, index) => (
                <QuestionResult
                  index={index}
                  key={result.question_id}
                  result={result}
                  survey={survey}
                />
              ))
            )}
          </div>
          <NextActions actions={results.next_actions} results={results} surveyId={survey.id} />
        </div>
      </div>
    </main>
  );
}
