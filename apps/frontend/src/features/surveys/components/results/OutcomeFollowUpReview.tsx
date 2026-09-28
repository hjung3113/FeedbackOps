import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import { ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import type { OutcomeFollowUpItem, OutcomeFollowUpReadDto, SurveyResultDto } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ListShell,
  Textarea,
} from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateFindingFromSurveyResponse } from '../../hooks/useCreateFindingFromSurveyResponse';
import {
  invalidateOutcomeFollowUpAfterConflict,
  useMarkOutcomeFollowUpNoAction,
  useReopenOutcomeFollowUp,
} from '../../hooks/useOutcomeFollowUp';
import type { Survey } from '../../types';
import { CreateFindingDraftPanel, excerptsByResponse } from './CreateFindingDraftPanel';
import { SurveyResultHeader } from './SurveyResultHeader';

type ResolutionFilter = OutcomeFollowUpItem['resolution'];
type DecisionAction = 'mark' | 'reopen';

const NOT_CLASSIFIABLE_BODY =
  '후속 검토는 마감된 Outcome 설문 중 충분한 응답이 모인 경우에만 제공됩니다.';

function displayResponseNumber(value: number): string {
  // Option B pads single-digit response numbers in both the list and detail header.
  return String(value).padStart(2, '0');
}

const FILTER_LABELS: Record<ResolutionFilter, string> = {
  open: 'Open',
  finding: '해소됨',
  no_follow_up: '후속 없음',
};

function resolutionLabel(item: OutcomeFollowUpItem): string {
  if (item.resolution === 'open') return 'Open';
  // Option B shows the populated Finding display ID alone in list rows.
  if (item.resolution === 'finding') return item.finding?.display_id ?? 'Finding';
  return '후속 없음';
}

function lowAnswerSummary(item: OutcomeFollowUpItem): string {
  return item.low_answers
    .map((answer) => `${answer.question_label} ${answer.value} / ${answer.rating_max}`)
    .join(' · ');
}

function submittedDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 제출`;
}

function currentStateText(item: OutcomeFollowUpItem): string {
  if (item.resolution === 'open') return 'Open — Finding 없음, 후속 없음 결정 없음';
  if (item.resolution === 'finding')
    return `해소됨 — ${item.finding?.display_id ? `Finding ${item.finding.display_id}` : 'Finding'}`;
  return '후속 없음';
}

function DecisionReasonDialog({
  action,
  onClose,
  onSubmit,
  pending,
  reason,
  setReason,
  errorMessage,
}: {
  action: DecisionAction | null;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  reason: string;
  setReason: (value: string) => void;
  errorMessage: string | null;
}) {
  const trimmedReason = reason.trim();
  const title = action === 'reopen' ? '후속 조치 다시 열기' : '후속 조치 없음 기록';
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid={`follow-up-${action ?? 'decision'}-dialog`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>결정 사유를 입력해 주세요.</DialogDescription>
        </DialogHeader>
        <label
          className="space-y-2 text-sm text-text-secondary"
          htmlFor="follow-up-decision-reason"
        >
          <span>사유</span>
          <Textarea
            aria-invalid={reason.length > 2000 || (reason.length > 0 && trimmedReason.length === 0)}
            data-testid="follow-up-decision-reason"
            id="follow-up-decision-reason"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
        {errorMessage && (
          <p
            className="text-sm text-text-danger"
            data-testid="follow-up-decision-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button
            disabled={trimmedReason.length === 0 || trimmedReason.length > 2000}
            loading={pending}
            onClick={onSubmit}
            type="button"
            variant="primary"
          >
            {action === 'reopen' ? '다시 열기' : '후속 조치 없음'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeFollowUpDetailPanel({
  item,
  survey,
  results,
  resultsError,
  resultsLoading,
  onClose,
}: {
  item: OutcomeFollowUpItem;
  survey: Survey;
  results?: SurveyResultDto | undefined;
  resultsError: boolean;
  resultsLoading: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const mark = useMarkOutcomeFollowUpNoAction(survey.id);
  const reopen = useReopenOutcomeFollowUp(survey.id);
  const createFinding = useCreateFindingFromSurveyResponse(survey.id);
  const [draftOpen, setDraftOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const responseExcerpts = results
    ? (excerptsByResponse(results).find((group) => group[0]?.response_id === item.response_id) ??
      [])
    : [];
  const actions = item.next_actions;

  async function submitDecision() {
    const trimmedReason = reason.trim();
    if (!dialogAction || trimmedReason.length === 0 || trimmedReason.length > 2000) return;
    setDecisionError(null);
    try {
      const request = {
        responseId: item.response_id,
        reason: trimmedReason,
        idempotencyKey,
      };
      if (dialogAction === 'mark') await mark.mutateAsync(request);
      else await reopen.mutateAsync(request);
      markConsumed();
      setDialogAction(null);
      setReason('');
      toast.success(
        dialogAction === 'mark'
          ? '후속 조치 없음으로 기록했습니다.'
          : '후속 조치를 다시 열었습니다.',
      );
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const failureCode = error.detail?.failure_code;
        if (failureCode === 'action_no_longer_available') {
          setDecisionError('이 응답은 더 이상 후속 조치 대상이 아닙니다.');
        } else if (failureCode === 'recovery_item_resolved') {
          setDecisionError('이미 처리된 응답입니다.');
        } else {
          setDecisionError(errorMapper(error.envelope).message);
        }
        await invalidateOutcomeFollowUpAfterConflict(queryClient, survey.id);
      } else if (error instanceof ApiError) {
        setDecisionError(errorMapper(error.envelope).message);
      } else {
        setDecisionError('요청을 처리하지 못했습니다.');
      }
    }
  }

  const excerptsUnavailable = responseExcerpts.length === 0;
  const dialogPending = mark.isPending || reopen.isPending;

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="follow-up-detail-panel"
    >
      <DetailPanelHeader
        kind="survey"
        id={`RESPONSE · 응답 #${displayResponseNumber(item.response_number)}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <h2 className="text-base font-semibold text-text-primary">후속 조치 필요</h2>
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
            저조 판정 근거
          </h3>
          <ul className="space-y-1 text-sm leading-relaxed text-text-primary">
            {item.low_answers.map((answer) => (
              <li key={answer.question_id}>
                {answer.question_label} {answer.value} / {answer.rating_max} (하위 구간)
              </li>
            ))}
          </ul>
        </section>
        {responseExcerpts.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">
              승인된 발췌
            </h3>
            <ul className="space-y-2">
              {responseExcerpts.map((excerpt) => (
                <li
                  className={[
                    'rounded border border-border-subtle bg-surface-card px-3 py-2',
                    'text-sm leading-relaxed text-text-secondary',
                  ].join(' ')}
                  key={excerpt.id}
                >
                  “{excerpt.text}”
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">현재 상태</h3>
          <p className="text-sm text-text-primary">{currentStateText(item)}</p>
          {item.decision && (
            <p className="text-sm text-text-secondary">
              {item.decision.state === 'no_follow_up' ? '후속 없음 결정 사유' : '다시 열기 사유'}:{' '}
              {item.decision.reason}
            </p>
          )}
        </section>
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-border-subtle p-4">
        {actions.map((action) => {
          if (action.availability === 'blocked_requestable') {
            return action.requestable_permission ? (
              <RequestAccessButton
                capability={action.requestable_permission.permission}
                key={action.id}
                managedSystemId={action.requestable_permission.managed_system_id}
                returnRouteIntent={`/surveys/${survey.id}/follow-up`}
              />
            ) : (
              <div className="space-y-1" key={action.id}>
                <Button disabled type="button" variant="secondary">
                  Request access
                </Button>
                <p className="text-sm text-text-muted">
                  Access details are unavailable, so this request cannot be submitted.
                </p>
              </div>
            );
          }
          if (action.id === 'create_finding') {
            return (
              <div className="space-y-1" key={action.id}>
                <Button
                  disabled={
                    resultsLoading || resultsError || excerptsUnavailable || createFinding.isPending
                  }
                  loading={createFinding.isPending}
                  onClick={() => setDraftOpen(true)}
                  type="button"
                  variant="primary"
                >
                  Create Finding
                </Button>
                {resultsLoading ? (
                  <p className="text-sm text-text-muted">승인된 발췌를 불러오는 중…</p>
                ) : resultsError ? (
                  <p className="text-sm text-text-danger" role="alert">
                    승인된 발췌를 불러오지 못했습니다.
                  </p>
                ) : excerptsUnavailable ? (
                  <p className="text-sm text-text-muted">
                    No approved excerpts are available for a response you can access.
                  </p>
                ) : null}
                {draftOpen && (
                  <CreateFindingDraftPanel
                    groups={responseExcerpts.length > 0 ? [responseExcerpts] : []}
                    scopedResponseId={item.response_id}
                    surveyId={survey.id}
                  />
                )}
              </div>
            );
          }
          if (action.id === 'mark_no_follow_up') {
            return (
              <Button
                key={action.id}
                onClick={() => {
                  setReason('');
                  setDecisionError(null);
                  setDialogAction('mark');
                }}
                type="button"
                variant="secondary"
              >
                후속 조치 없음…
              </Button>
            );
          }
          return (
            <Button
              key={action.id}
              onClick={() => {
                setReason('');
                setDecisionError(null);
                setDialogAction('reopen');
              }}
              type="button"
              variant="secondary"
            >
              다시 열기…
            </Button>
          );
        })}
      </footer>
      <DecisionReasonDialog
        action={dialogAction}
        errorMessage={decisionError}
        onClose={() => {
          setDialogAction(null);
          setDecisionError(null);
        }}
        onSubmit={() => void submitDecision()}
        pending={dialogPending}
        reason={reason}
        setReason={setReason}
      />
    </aside>
  );
}

function EmptyReviewPage({
  survey,
  title,
  body,
  followUpRead,
}: {
  survey: Survey;
  title: string;
  body: string;
  followUpRead?: OutcomeFollowUpReadDto | null | undefined;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurveyResultHeader activeTab="follow-up" followUpRead={followUpRead} survey={survey} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-6">
        <EmptyState body={body} title={title} />
        <Link
          className="mt-3 text-sm font-medium text-accent-primary underline-offset-2 hover:underline"
          params={{ surveyId: survey.id }}
          to="/surveys/$surveyId/results"
        >
          Results로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export function SurveyFollowUpUnavailable({ survey }: { survey: Survey }) {
  return (
    <EmptyReviewPage
      body={NOT_CLASSIFIABLE_BODY}
      survey={survey}
      title="후속 검토를 사용할 수 없습니다."
    />
  );
}

export function OutcomeFollowUpReview({
  survey,
  followUpRead,
  results,
  resultsError = false,
  resultsLoading = false,
}: {
  survey: Survey;
  followUpRead: OutcomeFollowUpReadDto;
  results?: SurveyResultDto | undefined;
  resultsError?: boolean;
  resultsLoading?: boolean;
}) {
  const [activeFilter, setActiveFilter] = useState<ResolutionFilter>('open');
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(
    followUpRead.personal_access
      ? (followUpRead.items.find((item) => item.resolution === 'open')?.response_id ?? null)
      : null,
  );

  if (!followUpRead.personal_access) {
    return (
      <EmptyReviewPage
        body="개인 응답 열람 권한이 있어야 응답별로 검토할 수 있습니다."
        followUpRead={followUpRead}
        survey={survey}
        title="개인 응답 열람 권한이 필요합니다."
      />
    );
  }
  if (!followUpRead.classifiable) {
    return (
      <EmptyReviewPage
        body={NOT_CLASSIFIABLE_BODY}
        followUpRead={followUpRead}
        survey={survey}
        title="후속 검토를 사용할 수 없습니다."
      />
    );
  }

  const allItems = followUpRead.items;
  const visibleItems = allItems.filter((item) => item.resolution === activeFilter);
  const selectedItem = selectedResponseId
    ? allItems.find((item) => item.response_id === selectedResponseId)
    : undefined;

  function selectFilter(nextFilter: ResolutionFilter) {
    setActiveFilter(nextFilter);
    setSelectedResponseId(
      allItems.find((item) => item.resolution === nextFilter)?.response_id ?? null,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="survey-follow-up-review">
      <SurveyResultHeader activeTab="follow-up" followUpRead={followUpRead} survey={survey} />
      <ListShell
        className="flex-1"
        list={
          <div className="min-h-full">
            {visibleItems.map((item) => (
              <button
                aria-pressed={selectedResponseId === item.response_id}
                className={[
                  'grid w-full grid-cols-[96px_minmax(0,1fr)_110px_110px] items-center gap-3',
                  'border-b border-border-subtle',
                  'px-5 py-3 text-left text-sm hover:bg-surface-card',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedResponseId === item.response_id
                    ? 'border-l-2 border-l-border-selected bg-surface-card'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`follow-up-row-${item.response_number}`}
                key={item.response_id}
                onClick={() => setSelectedResponseId(item.response_id)}
                type="button"
              >
                <span className="font-mono text-text-secondary">
                  응답 #{displayResponseNumber(item.response_number)}
                </span>
                <span className="truncate text-text-primary">{lowAnswerSummary(item)}</span>
                <span
                  className={
                    item.resolution === 'open' ? 'text-text-warning' : 'text-text-secondary'
                  }
                >
                  {resolutionLabel(item)}
                </span>
                <span className="text-text-muted">{submittedDate(item.submitted_at)}</span>
              </button>
            ))}
            {visibleItems.length === 0 && (
              <EmptyState
                {...(activeFilter === 'open' ? { body: '현재 검토할 후속 조치가 없습니다.' } : {})}
                className="px-4"
                size="sm"
                title={
                  allItems.length === 0
                    ? '저조한 응답이 없습니다.'
                    : `${FILTER_LABELS[activeFilter]} 항목이 없습니다.`
                }
              />
            )}
          </div>
        }
        tabs={
          <div className="flex w-full items-center gap-2 overflow-x-auto">
            {(['open', 'finding', 'no_follow_up'] as const).map((filter) => {
              const count = allItems.filter((item) => item.resolution === filter).length;
              const selected = activeFilter === filter;
              return (
                <button
                  aria-pressed={selected}
                  className={[
                    'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium',
                    selected
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : [
                          'border border-border-subtle text-text-muted',
                          'hover:bg-surface-raised hover:text-text-primary',
                        ].join(' '),
                  ].join(' ')}
                  key={filter}
                  onClick={() => selectFilter(filter)}
                  type="button"
                >
                  {FILTER_LABELS[filter]} {count}
                </button>
              );
            })}
            <span className="ml-auto hidden whitespace-nowrap text-xs text-text-muted lg:inline">
              저조 = 척도 문항 하위 구간 · 마감 · 응답 5건 이상
            </span>
          </div>
        }
        detailPanel={
          selectedItem ? (
            <OutcomeFollowUpDetailPanel
              item={selectedItem}
              key={selectedItem.response_id}
              onClose={() => setSelectedResponseId(null)}
              resultsError={resultsError}
              resultsLoading={resultsLoading}
              results={results}
              survey={survey}
            />
          ) : null
        }
      />
      {resultsError && (
        <output className="sr-only">
          승인된 발췌를 불러오지 못했습니다. Create Finding을 사용할 수 없습니다.
        </output>
      )}
    </div>
  );
}
