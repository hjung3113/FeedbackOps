import { fetchEntityLinksBySource } from '@/lib/api/entity-links';
import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import type {
  EntityLinkTargetSummary,
  FindingDto,
  ListEntityLinksResponse,
  TaskRequestStatus,
} from '@fops/shared';
import { taskRequestStatusSchema } from '@fops/shared';
import { Button, FieldRow } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { FindingRequestTaskDraftHost } from './FindingRequestTaskDraftHost';

export type RequestedTaskRequestSummary = Extract<
  EntityLinkTargetSummary,
  { type: 'task_request' }
> & { status: TaskRequestStatus };

export function requestedTaskRequestsFromEntityLinks(
  findingId: string,
  response: ListEntityLinksResponse,
): RequestedTaskRequestSummary[] {
  const requests: RequestedTaskRequestSummary[] = [];
  for (const link of response.items) {
    if (
      link.visibility_state !== 'allowed' ||
      link.status !== 'active' ||
      link.source_type !== 'finding' ||
      link.source_id !== findingId ||
      link.target_type !== 'task_request' ||
      link.relation_type !== 'requested_task' ||
      link.target_summary?.type !== 'task_request' ||
      link.target_summary.id !== link.target_id
    ) {
      continue;
    }
    const status = taskRequestStatusSchema.safeParse(link.target_summary.status);
    if (status.success) requests.push({ ...link.target_summary, status: status.data });
  }
  return requests;
}

export interface FindingExecutionSectionController {
  requestTaskOpen: boolean;
  setRequestTaskOpen: (open: boolean) => void;
  taskRequestRegionRef: React.RefObject<HTMLDivElement | null>;
  requestedTaskRequests: RequestedTaskRequestSummary[];
  requestedTaskRequestsState: 'loading' | 'error' | 'loaded';
  retryInProgress: boolean;
  pendingTaskRequest: RequestedTaskRequestSummary | undefined;
  handleRetryRequestedTaskRequests: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function useFindingExecutionSection(finding: FindingDto): FindingExecutionSectionController {
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const taskRequestRegionRef = React.useRef<HTMLDivElement>(null);
  const requestedTaskRequestQuery = useQuery({
    queryKey: ['entity-links', 'finding', finding.id, 'requested_task'] as const,
    queryFn: ({ signal }) => fetchEntityLinksBySource('finding', finding.id, { signal }),
    select: (response) => requestedTaskRequestsFromEntityLinks(finding.id, response),
    staleTime: 30 * 1000,
    retry: false,
  });
  const [retryInProgress, setRetryInProgress] = React.useState(false);
  const retryInProgressRef = React.useRef(false);
  const retryObservedFetchingRef = React.useRef(false);
  const retryHadFocusRef = React.useRef(false);
  const retryButtonAtActivationRef = React.useRef<HTMLButtonElement | null>(null);
  const requestedTaskRequestQueryState = requestedTaskRequestQuery.isError
    ? 'error'
    : requestedTaskRequestQuery.isPending
      ? 'loading'
      : 'loaded';

  React.useEffect(() => {
    if (retryInProgress) {
      if (requestedTaskRequestQuery.isFetching) {
        retryObservedFetchingRef.current = true;
        return;
      }
      if (!retryObservedFetchingRef.current) return;

      retryInProgressRef.current = false;
      setRetryInProgress(false);
      retryObservedFetchingRef.current = false;
      return;
    }

    if (!retryHadFocusRef.current) return;
    const focusStillBelongsToRetry =
      document.activeElement === retryButtonAtActivationRef.current ||
      document.activeElement === document.body;
    if (requestedTaskRequestQueryState === 'loaded' && focusStillBelongsToRetry) {
      const region = taskRequestRegionRef.current;
      const requestLink = region?.querySelector<HTMLAnchorElement>('a');
      (requestLink ?? region)?.focus();
    }
    retryHadFocusRef.current = false;
    retryButtonAtActivationRef.current = null;
  }, [retryInProgress, requestedTaskRequestQuery.isFetching, requestedTaskRequestQueryState]);

  function handleRetryRequestedTaskRequests(event: React.MouseEvent<HTMLButtonElement>): void {
    if (retryInProgressRef.current) return;
    retryInProgressRef.current = true;
    retryObservedFetchingRef.current = false;
    retryHadFocusRef.current = document.activeElement === event.currentTarget;
    retryButtonAtActivationRef.current = retryHadFocusRef.current ? event.currentTarget : null;
    setRetryInProgress(true);
    void requestedTaskRequestQuery.refetch();
  }

  const requestedTaskRequests = requestedTaskRequestQuery.isSuccess
    ? (requestedTaskRequestQuery.data ?? [])
    : [];

  return {
    requestTaskOpen,
    setRequestTaskOpen,
    taskRequestRegionRef,
    requestedTaskRequests,
    requestedTaskRequestsState: requestedTaskRequestQueryState,
    retryInProgress,
    pendingTaskRequest: requestedTaskRequests.find(
      (request) => request.status === 'pending_review' || request.status === 'needs_more_evidence',
    ),
    handleRetryRequestedTaskRequests,
  };
}

export function FindingExecutionRequestRow({
  controller,
}: {
  controller: FindingExecutionSectionController;
}): React.ReactElement {
  const {
    requestedTaskRequests,
    requestedTaskRequestsState,
    retryInProgress,
    taskRequestRegionRef,
    handleRetryRequestedTaskRequests,
  } = controller;

  return (
    <FieldRow label="Task Request" className="px-0">
      <div ref={taskRequestRegionRef} tabIndex={-1} className="min-w-0">
        {requestedTaskRequestsState === 'loading' && !retryInProgress ? (
          <span className="text-text-muted" aria-live="polite">
            확인 중…
          </span>
        ) : requestedTaskRequestsState === 'error' || retryInProgress ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={retryInProgress ? 'text-text-muted' : 'text-text-danger'}
              {...(retryInProgress
                ? { 'aria-live': 'polite' as const }
                : { role: 'alert' as const })}
            >
              {retryInProgress ? '확인 중…' : 'Task Request를 확인하지 못했습니다.'}
            </span>
            <Button
              type="button"
              variant="subtle"
              size="sm"
              aria-disabled={retryInProgress}
              aria-busy={retryInProgress}
              onClick={handleRetryRequestedTaskRequests}
            >
              다시 시도
            </Button>
          </div>
        ) : requestedTaskRequests.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {requestedTaskRequests.map((request) => (
              <Link
                key={request.id}
                to="/tasks"
                search={{ view: 'requests', param: request.id }}
                className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
              >
                <span className="font-mono">{request.display_id}</span>
                <span className="text-xs text-text-muted">
                  {TASK_REQUEST_STATUS_LABELS[request.status]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </div>
    </FieldRow>
  );
}

export function FindingExecutionRequestDraftSlot({
  finding,
  controller,
}: {
  finding: FindingDto;
  controller: FindingExecutionSectionController;
}): React.ReactElement {
  return (
    <FindingRequestTaskDraftHost
      findingId={finding.id}
      finding={finding}
      open={controller.requestTaskOpen}
      onClose={() => controller.setRequestTaskOpen(false)}
    />
  );
}

export function FindingExecutionRequestActions({
  controller,
  canManage,
}: {
  controller: FindingExecutionSectionController;
  canManage: boolean;
}): React.ReactElement | null {
  const { requestedTaskRequestsState, pendingTaskRequest, setRequestTaskOpen } = controller;
  if (requestedTaskRequestsState !== 'loaded') return null;

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">주요 실행</legend>
      {pendingTaskRequest ? (
        <Button asChild variant="primary" size="sm">
          <Link to="/tasks" search={{ view: 'requests', param: pendingTaskRequest.id }}>
            Task Request 보기
          </Link>
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setRequestTaskOpen(true)}
          disabled={!canManage}
          data-testid="request-task-btn"
        >
          Task 요청
        </Button>
      )}
    </fieldset>
  );
}
