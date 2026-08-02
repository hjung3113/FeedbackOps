// VocDetailPanel — orchestrator for the read-only VOC detail panel (Slice 3 #20 C8).
// REV-1 #6: dirty composer close now intercepted — DirtyConfirmation shown before panel close.

import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { usePublicUpdateReviewCandidates } from '@/features/voc/hooks/usePublicUpdateReviewCandidates';
import { useRequestTaskFromVoc } from '@/features/voc/hooks/useRequestTaskFromVoc';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import { type ApiError, errorMapper, getTask, useIdempotencyKey } from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { useMe } from '@/lib/auth/useMe';
import type { EntityLinkDto, VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  DirtyConfirmation,
  PermissionBlockedPanel,
  Skeleton,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { toast } from 'sonner';

import { CreateFindingModal } from '@/features/integration/components/FindingDetail/CreateFindingModal';
import { RequestTaskModal } from '@/features/tasks/components/RequestTaskModal';
import { ComposerSection } from './ComposerSection';
import { ConversationTimeline } from './ConversationTimeline';
import { DescriptionSection } from './DescriptionSection';
import { DetailHeader } from './DetailHeader';
import { DetailPanelNotFound } from './DetailPanelNotFound';
import { IdentityMetadataStrip, IdentitySection } from './IdentitySection';
import { LinkedEntityTrailSection } from './LinkedEntityTrailSection';
import { LinkedExecutionSection } from './LinkedExecutionSection';
import { NextActionFooter } from './NextActionFooter';
import { PublicUpdateReviewModal } from './PublicUpdateReviewModal';
import { SimilarVocSection, hasSimilarVocSection } from './SimilarVocSection';
import { TriageBlock } from './TriageBlock';

// ── Props ────────────────────────────────────────────────────────────────────

export interface VocDetailPanelProps {
  vocId: string;
  /** Called when user closes the panel via X button or 404 selection clear. */
  onClose: () => void;
  /** Optional fullscreen toggle handler from useFullscreenPanel (#18). */
  onExpandToggle?: () => void;
}

// ── Type guards ──────────────────────────────────────────────────────────────

/** A summary envelope has permission_decisions but no title field. */
function isSummaryEnvelope(
  data: VocDetailEnvelope | VocSummaryEnvelope,
): data is VocSummaryEnvelope {
  return !('title' in data);
}

type AllowedEntityLink = Extract<EntityLinkDto, { visibility_state: 'allowed' }>;

function isAllowedTaskLinkForVoc(link: EntityLinkDto, vocId: string): link is AllowedEntityLink {
  if (link.visibility_state !== 'allowed') return false;
  return (
    (link.source_type === 'voc' && link.source_id === vocId && link.target_type === 'task') ||
    (link.target_type === 'voc' && link.target_id === vocId && link.source_type === 'task')
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function DetailPanelSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-4" aria-label="VOC 상세 불러오는 중">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function VocDetailPanel({
  vocId,
  onClose,
  onExpandToggle,
}: VocDetailPanelProps): React.ReactElement {
  const { data, isLoading, isError, error } = useVocDetail(vocId);
  const { data: me } = useMe();

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="h-12 border-b border-border-subtle flex items-center px-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <DetailPanelSkeleton />
      </div>
    );
  }

  // 2. Error — check 404 first
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return <DetailPanelNotFound onClearSelection={onClose} />;
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-feedback-error">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!data) {
    return <DetailPanelNotFound onClearSelection={onClose} />;
  }

  // 3. Summary envelope — permission blocked
  if (isSummaryEnvelope(data)) {
    return (
      <SummaryPermissionView
        data={data}
        vocId={vocId}
        onClose={onClose}
        {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      />
    );
  }

  // 4. Full detail envelope
  const voc: VocDetailEnvelope = data;
  const isReporterOnOwnVoc = me?.actor.id === voc.reporter_id && voc.triage_state === 'untriaged';
  // Raw Task DTOs are an operator-only surface. Identity uncertainty and every
  // User role fail closed, including the reporter who owns this VOC.
  const canRenderAllowedTask =
    me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  return (
    <FullDetailView
      voc={voc}
      vocId={vocId}
      onClose={onClose}
      {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      isReporterOnOwnVoc={isReporterOnOwnVoc}
      canRenderAllowedTask={canRenderAllowedTask}
      me={me ?? null}
    />
  );
}

// ── Full detail view (extracted to own component to own dirty state) ──────────

interface FullDetailViewProps {
  voc: VocDetailEnvelope;
  vocId: string;
  onClose: () => void;
  onExpandToggle?: () => void;
  isReporterOnOwnVoc: boolean;
  canRenderAllowedTask: boolean;
  me: import('@/lib/auth/useMe').MeResponse | null;
}

// Prototype ref (screen-voc.jsx:172-182): section IDs for the detail panel.
// Execution section only shown when there's an active finding/task (Slice 4+).
// For Slice 3, show all static sections; Internal tab maps to the internal
// conversation tab in ConversationTimeline.
const STATIC_DETAIL_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'triage', label: 'Triage' },
  { id: 'description', label: 'Description' },
  { id: 'trail', label: 'Trail' },
  { id: 'conversation', label: 'Public' },
  { id: 'internal', label: 'Internal' },
  { id: 'compose', label: 'Compose' },
];

function FullDetailView({
  voc,
  vocId,
  onClose,
  onExpandToggle,
  isReporterOnOwnVoc,
  canRenderAllowedTask,
  me,
}: FullDetailViewProps): React.ReactElement {
  // REV-1 #6: track composer dirty state; intercept panel close to show DirtyConfirmation.
  const [composerDirty, setComposerDirty] = React.useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = React.useState(false);
  const [createFindingOpen, setCreateFindingOpen] = React.useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const navigate = useNavigate();
  const { key: requestTaskIdempotencyKey, markConsumed: markRequestTaskConsumed } =
    useIdempotencyKey();
  // Scroll container ref for section nav anchor tracking
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', voc.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: voc.primary_managed_system_id,
        includeArchived: true,
        signal,
      }),
    staleTime: 10 * 60 * 1000,
  });
  const analyticsAreasById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );
  const allowedTaskLink = voc.links?.find((link) => isAllowedTaskLinkForVoc(link, voc.id));
  const linkedTaskId =
    allowedTaskLink?.source_type === 'task'
      ? allowedTaskLink.source_id
      : allowedTaskLink?.target_type === 'task'
        ? allowedTaskLink.target_id
        : null;
  const linkedTaskQuery = useQuery({
    queryKey: ['task', linkedTaskId] as const,
    queryFn: ({ signal }) => getTask(linkedTaskId as string, signal),
    enabled: linkedTaskId !== null && canRenderAllowedTask,
    staleTime: 30 * 1000,
  });
  const linkedTask =
    canRenderAllowedTask && linkedTaskQuery.data !== undefined
      ? { title: linkedTaskQuery.data.title, status: linkedTaskQuery.data.status }
      : null;

  // FE display hint only (ADR-0024 §C): gate button to Admin or Developer.
  const canCreateFinding = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';
  const reviewCandidates = usePublicUpdateReviewCandidates(voc.id, canCreateFinding);
  const pendingReviewCount = reviewCandidates.data?.items.length ?? 0;
  const canRequestTask = canCreateFinding;
  const showsSimilarVocSection = hasSimilarVocSection(voc.similar, voc.similar_count);
  const detailSections = showsSimilarVocSection
    ? [
        ...STATIC_DETAIL_SECTIONS.slice(0, 4),
        { id: 'similar', label: 'Similar' },
        ...STATIC_DETAIL_SECTIONS.slice(4),
      ]
    : STATIC_DETAIL_SECTIONS;

  const requestTaskMutation = useRequestTaskFromVoc({
    vocId,
    idempotencyKey: requestTaskIdempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function handleClose() {
    if (composerDirty) {
      setDirtyConfirmOpen(true);
    } else {
      onClose();
    }
  }

  function handleDirtyConfirm() {
    setDirtyConfirmOpen(false);
    setComposerDirty(false);
    onClose();
  }

  function handleDirtyCancel() {
    setDirtyConfirmOpen(false);
  }

  function closeRequestTaskModal(): void {
    requestTaskMutation.reset();
    setRequestTaskOpen(false);
  }

  function handleSimilarVocSelect(id: string): void {
    // Match VOC list-row selection: retain the current view and filters.
    void navigate({
      to: '/vocs',
      search: (prev: Record<string, unknown>) => ({ ...prev, selected: id }),
    });
  }

  return (
    <>
      <div className="flex flex-col h-full" data-testid="voc-detail-panel">
        <DetailHeader
          vocId={vocId}
          displayId={voc.display_id}
          onClose={handleClose}
          {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
        />

        {/* Section nav — sticky anchor tabs (prototype: screen-voc.jsx:191) */}
        <DetailPanelSectionNav sections={detailSections} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          className="flex flex-col flex-1 min-h-0 overflow-y-auto pt-7 px-6 pb-16"
        >
          <div data-anchor="overview">
            <IdentitySection
              voc={voc}
              reporterDisplayName={actorNamesById.get(voc.reporter_id) ?? me?.actor.display_name}
            />
          </div>
          <div data-anchor="triage">
            <TriageBlock
              voc={voc}
              ownerDisplayName={
                voc.owner_user_id !== null ? (actorNamesById.get(voc.owner_user_id) ?? null) : null
              }
              analyticsAreaName={
                voc.analytics_area_id !== null
                  ? (analyticsAreasById.get(voc.analytics_area_id) ?? null)
                  : null
              }
            />
          </div>
          <div data-anchor="description">
            <DescriptionSection voc={voc} isReporterOnOwnVoc={isReporterOnOwnVoc} />
            {/* Relocated metadata strip — severity/managed-system/AA/source-context
                chips moved out of the title block per .review/title-reference.png */}
            <IdentityMetadataStrip
              voc={voc}
              analyticsAreaName={
                voc.analytics_area_id !== null
                  ? (analyticsAreasById.get(voc.analytics_area_id) ?? null)
                  : null
              }
            />
          </div>
          <div data-anchor="trail">
            <LinkedExecutionSection
              voc={voc}
              linkedTask={linkedTask}
              hasReporterTaskSummary={
                voc.links?.some(
                  (link) =>
                    link.visibility_state === 'summary_visible' &&
                    (link.source_type === 'task' || link.target_type === 'task'),
                ) ?? false
              }
            />
            <LinkedEntityTrailSection
              links={voc.links ?? []}
              isReporterContext={!canRenderAllowedTask}
            />
          </div>
          {showsSimilarVocSection && (
            <div data-anchor="similar">
              <SimilarVocSection
                similar={voc.similar}
                similarCount={voc.similar_count}
                onSelect={handleSimilarVocSelect}
              />
            </div>
          )}
          <div data-anchor="conversation">
            <ConversationTimeline voc={voc} actorNamesById={actorNamesById} />
          </div>
          <div data-anchor="internal" />
          <div data-anchor="compose">
            <ComposerSection voc={voc} me={me} onDirtyChange={setComposerDirty} />
            {canCreateFinding && pendingReviewCount > 0 && (
              <div className="mt-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewOpen(true)}
                  data-testid="public-update-review-button"
                >
                  리뷰{' '}
                  <span className="ml-1 rounded-full bg-surface-row-hover px-1.5 py-0.5 text-xs">
                    {pendingReviewCount}
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>

        <NextActionFooter voc={voc} />
        {(canCreateFinding || canRequestTask) && (
          <div className="px-4 pb-3 flex justify-end gap-2 border-t border-border-subtle pt-2">
            {canRequestTask && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRequestTaskOpen(true)}
                data-testid="voc-request-task-button"
              >
                Task 요청
              </Button>
            )}
            {canCreateFinding && (
              <Button variant="outline" size="sm" onClick={() => setCreateFindingOpen(true)}>
                Finding 생성
              </Button>
            )}
          </div>
        )}
      </div>

      <DirtyConfirmation
        open={dirtyConfirmOpen}
        onConfirm={handleDirtyConfirm}
        onCancel={handleDirtyCancel}
      />
      <CreateFindingModal
        vocId={vocId}
        open={createFindingOpen}
        onClose={() => setCreateFindingOpen(false)}
      />
      <RequestTaskModal
        open={requestTaskOpen}
        evidenceSummaryDefault={`VOC ${voc.display_id}: ${voc.title}`}
        isSubmitting={requestTaskMutation.isPending}
        source={{ type: 'voc', id: vocId }}
        onClose={closeRequestTaskModal}
        onSubmit={(values) => {
          requestTaskMutation.mutate(values, {
            onSuccess: () => {
              markRequestTaskConsumed();
              setRequestTaskOpen(false);
              requestTaskMutation.reset();
              toast.success('Task Request가 생성되었습니다.');
            },
          });
        }}
      />
      <PublicUpdateReviewModal voc={voc} open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  );
}

// ── Summary envelope view ─────────────────────────────────────────────────────

interface SummaryPermissionViewProps {
  data: VocSummaryEnvelope;
  vocId: string;
  onClose: () => void;
  onExpandToggle?: () => void;
}

function SummaryPermissionView({
  data,
  vocId,
  onClose,
  onExpandToggle,
}: SummaryPermissionViewProps): React.ReactElement {
  const selfDecision = usePermissionDecision(data, '_self');

  return (
    <div className="flex flex-col h-full">
      <DetailHeader
        vocId={vocId}
        displayId={data.display_id}
        onClose={onClose}
        {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      />
      <div className="flex-1 flex items-center justify-center p-4">
        {selfDecision !== null ? (
          <PermissionBlockedPanel
            state={selfDecision.state}
            category="VOC 상세"
            {...(selfDecision.reason !== undefined ? { reason: selfDecision.reason } : {})}
            {...(selfDecision.requiredScope !== undefined
              ? { requiredScope: selfDecision.requiredScope }
              : {})}
            {...(selfDecision.decisionId !== undefined
              ? { decisionId: selfDecision.decisionId }
              : {})}
          />
        ) : (
          <PermissionBlockedPanel state="denied" category="VOC 상세" />
        )}
      </div>
    </div>
  );
}
