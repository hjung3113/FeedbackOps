// FullFindingDetail — composition/rendering for a loaded Finding.
// Pure view: all state, queries and handlers come from useFindingDetailController.

import { ProgressNotesSection } from '@/features/cross-system/progress-notes/ProgressNotesSection';
import { useRequestTaskFromFinding } from '@/features/findings/hooks/useRequestTaskFromFinding';
import { TaskRequestDraftCard } from '@/features/tasks/components/TaskRequestDraftCard';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SOURCE_TYPE_LABELS,
  FINDING_STATUS_LABELS,
  TASK_REQUEST_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { FindingDto, FindingStatus } from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  PanelSectionTitle,
  PanelTitleBlock,
  SeverityBadge,
  type SeverityEnum,
  UserChip,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { toast } from 'sonner';
import { AddEvidenceModal } from './AddEvidenceModal';
import { EvidenceHighlightsSection } from './EvidenceHighlights';
import { LinkEvidenceModal } from './LinkEvidenceModal';
import { LinkTaskModal } from './LinkTaskModal';
import { FitBadge, SectionDivider } from './detail-primitives';
import { useFindingDetailController } from './useFindingDetailController';

function FindingRequestTaskDraft({
  finding,
  idempotencyKey,
  markConsumed,
  onClose,
}: {
  finding: FindingDto;
  idempotencyKey: string;
  markConsumed: () => void;
  onClose: () => void;
}): React.ReactElement {
  const mutation = useRequestTaskFromFinding({
    findingId: finding.id,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  return (
    <TaskRequestDraftCard
      sourceKind="Finding"
      sourceDisplayId={finding.display_id}
      evidenceSummaryDefault={finding.summary}
      isSubmitting={mutation.isPending}
      source={{ type: 'finding', id: finding.id }}
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

// ── Full detail view ─────────────────────────────────────────────────────────

interface FullFindingDetailProps {
  finding: FindingDto;
}
export function FullFindingDetail({ finding }: FullFindingDetailProps): React.ReactElement {
  const { key: requestTaskKey, markConsumed: markRequestTaskConsumed } = useIdempotencyKey();
  const {
    sections: DETAIL_SECTIONS,
    scrollRef,
    addEvidenceOpen,
    setAddEvidenceOpen,
    linkEvidenceOpen,
    setLinkEvidenceOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    linkTaskOpen,
    setLinkTaskOpen,
    actorsById,
    managedSystemsById,
    analyticsAreasById,
    linkedVocTitle,
    linkedVocDisplayId,
    linkedTaskQuery,
    requestedTaskRequests,
    requestedTaskRequestsState,
    requestedTaskRequestsFetching,
    retryRequestedTaskRequests,
    canManage,
    handleMarkNotActionable,
    markNotActionableDisabled,
  } = useFindingDetailController(finding);
  const pendingTaskRequest = requestedTaskRequests.find(
    (request) => request.status === 'pending_review' || request.status === 'needs_more_evidence',
  );
  const [retryInProgress, setRetryInProgress] = React.useState(false);
  const retryInProgressRef = React.useRef(false);
  const retryObservedFetchingRef = React.useRef(false);
  const retryHadFocusRef = React.useRef(false);
  const retryButtonAtActivationRef = React.useRef<HTMLButtonElement | null>(null);
  const taskRequestRegionRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (retryInProgress) {
      if (requestedTaskRequestsFetching) {
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
    if (requestedTaskRequestsState === 'loaded' && focusStillBelongsToRetry) {
      const region = taskRequestRegionRef.current;
      const requestLink = region?.querySelector<HTMLAnchorElement>('a');
      (requestLink ?? region)?.focus();
    }
    retryHadFocusRef.current = false;
    retryButtonAtActivationRef.current = null;
  }, [retryInProgress, requestedTaskRequestsFetching, requestedTaskRequestsState]);

  function handleRetryRequestedTaskRequests(event: React.MouseEvent<HTMLButtonElement>): void {
    if (retryInProgressRef.current) return;
    retryInProgressRef.current = true;
    retryObservedFetchingRef.current = false;
    retryHadFocusRef.current = document.activeElement === event.currentTarget;
    retryButtonAtActivationRef.current = retryHadFocusRef.current ? event.currentTarget : null;
    setRetryInProgress(true);
    retryRequestedTaskRequests();
  }

  return (
    <>
      <div className="flex h-full flex-col" data-testid="finding-detail-panel">
        <DetailPanelSectionNav sections={DETAIL_SECTIONS} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          {/* Summary */}
          <div data-anchor="summary" className="flex flex-col gap-1">
            <PanelTitleBlock title={finding.title} className="px-0" />
            <PanelSectionTitle>요약</PanelSectionTitle>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{finding.summary}</p>
          </div>

          <SectionDivider />

          {/* Metadata grid — Source Type / Severity / Confidence / Status */}
          <div data-anchor="metadata" className="flex flex-col gap-2">
            <PanelSectionTitle>소스 / 심각도 / 신뢰도</PanelSectionTitle>
            <FieldRow label="소스 유형" className="px-0">
              <FitBadge>{FINDING_SOURCE_TYPE_LABELS[finding.source_type]}</FitBadge>
            </FieldRow>
            <FieldRow label="심각도" className="px-0">
              <SeverityBadge severity={finding.severity as SeverityEnum} />
            </FieldRow>
            <FieldRow label="신뢰도" className="px-0">
              {finding.confidence !== null ? (
                FINDING_CONFIDENCE_LABELS[finding.confidence]
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <FitBadge>{FINDING_STATUS_LABELS[finding.status]}</FitBadge>
            </FieldRow>
            <FieldRow label="생성자" className="px-0">
              <UserChip
                user={{ display_name: actorsById.get(finding.created_by) ?? '생성자 없음' }}
                size="sm"
              />
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Evidence Highlights — per design/05 layout: after Summary/Source/Severity/Confidence */}
          <div data-anchor="evidence" className="flex flex-col gap-3">
            <PanelSectionTitle>
              {GLOSSARY.evidenceHighlight} ({finding.evidence_count})
            </PanelSectionTitle>
            <EvidenceHighlightsSection
              findingId={finding.id}
              evidenceCount={finding.evidence_count}
            />
          </div>

          <SectionDivider />

          {/* Primary Managed System */}
          <div data-anchor="managed-system" className="flex flex-col gap-2">
            <PanelSectionTitle>주요 Managed System</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <ManagedSystemPill
                name={managedSystemsById.get(finding.primary_managed_system_id) ?? 'Managed System'}
              />
            </FieldRow>
          </div>

          {/* Affected Analytics Area */}
          <div data-anchor="analytics-area" className="flex flex-col gap-2">
            <PanelSectionTitle>영향 Analytics Area</PanelSectionTitle>
            <FieldRow label="Analytics Area" className="px-0">
              {finding.analytics_area_id !== null ? (
                <FitBadge>
                  {analyticsAreasById.get(finding.analytics_area_id) ?? 'Analytics Area'}
                </FitBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Linked VOC — why this Finding exists */}
          <div data-anchor="links" className="flex flex-col gap-2">
            <PanelSectionTitle>연결된 VOC / Task</PanelSectionTitle>
            <FieldRow label={GLOSSARY.linkedVoc} className="px-0">
              {finding.source_type === 'voc' && finding.source_id !== null ? (
                <Link
                  to="/vocs"
                  search={{ view: 'inbox', selected: finding.source_id }}
                  className="inline-flex items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                >
                  <span>{linkedVocTitle ?? GLOSSARY.linkedVoc}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedVocDisplayId ?? shortId(finding.source_id)}
                  </span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label={GLOSSARY.linkedTask} className="px-0">
              {finding.linked_task_id !== null ? (
                <Link
                  to="/tasks"
                  search={{ view: 'backlog', param: finding.linked_task_id }}
                  className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                >
                  <span>{linkedTaskQuery.data?.title ?? GLOSSARY.linkedTask}</span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
                    {linkedTaskQuery.data?.display_id ?? shortId(finding.linked_task_id)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">이동</span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
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
          </div>
          {requestTaskOpen && (
            <FindingRequestTaskDraft
              finding={finding}
              idempotencyKey={requestTaskKey}
              markConsumed={markRequestTaskConsumed}
              onClose={() => setRequestTaskOpen(false)}
            />
          )}

          <SectionDivider />

          {/* Progress notes (#377) — timeline visible to any finding reader;
              composer gated to finding.manage (backend authoritative). */}
          <div data-anchor="notes" className="flex flex-col gap-2">
            <PanelSectionTitle>진행 메모</PanelSectionTitle>
            <ProgressNotesSection
              resource={{ kind: 'finding', id: finding.id }}
              canCompose={canManage}
              actorNamesById={actorsById}
              renderStatusBadge={(status: FindingStatus) => (
                <FitBadge>{FINDING_STATUS_LABELS[status]}</FitBadge>
              )}
            />
          </div>
        </div>

        {/* CTA Footer */}
        <div className="sticky bottom-0 shrink-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-col gap-2">
          {requestedTaskRequestsState === 'loaded' && (
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
          )}
          <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
            <legend className="sr-only">보조 작업</legend>
            {pendingTaskRequest && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRequestTaskOpen(true)}
                disabled={!canManage}
                data-testid="request-task-btn"
              >
                Task 요청
              </Button>
            )}
            {/* Add Evidence — gated to finding.manage; backend authoritative */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddEvidenceOpen(true)}
              disabled={!canManage}
              data-testid="add-evidence-btn"
            >
              Evidence 추가
            </Button>

            {/* Link Existing Evidence — gated to finding.manage; backend authoritative */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkEvidenceOpen(true)}
              disabled={!canManage}
              data-testid="link-evidence-btn"
            >
              기존 Evidence 연결
            </Button>
            {finding.linked_task_id === null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkTaskOpen(true)}
                disabled={!canManage}
                data-testid="link-task-btn"
              >
                Task 연결
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkNotActionable}
              disabled={markNotActionableDisabled}
              data-testid="mark-not-actionable-btn"
            >
              조치 불필요 표시
            </Button>
          </fieldset>
        </div>
      </div>

      {/* Modals */}
      <AddEvidenceModal
        findingId={finding.id}
        open={addEvidenceOpen}
        onClose={() => setAddEvidenceOpen(false)}
      />
      <LinkEvidenceModal
        findingId={finding.id}
        open={linkEvidenceOpen}
        onClose={() => setLinkEvidenceOpen(false)}
      />
      <LinkTaskModal finding={finding} open={linkTaskOpen} onClose={() => setLinkTaskOpen(false)} />
    </>
  );
}
