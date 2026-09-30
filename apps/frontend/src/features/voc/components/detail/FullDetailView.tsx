import type { VocDetailEnvelope } from '@fops/shared';
import { Button, DetailPanelSectionNav, DirtyConfirmation } from '@fops/ui';
import type * as React from 'react';

import { CreateFindingModal } from '@/features/cross-system/create-finding/CreateFindingModal';
import { TaskRequestDraftCard } from '@/features/tasks/components/TaskRequestDraftCard';
import type { MeResponse } from '@/lib/auth/useMe';
import { ComposerSection } from './ComposerSection';
import { ConversationTimeline } from './ConversationTimeline';
import { DescriptionSection } from './DescriptionSection';
import { DetailHeader } from './DetailHeader';
import { IdentityMetadataStrip, IdentitySection } from './IdentitySection';
import { LinkedEntityTrailSection } from './LinkedEntityTrailSection';
import { LinkedExecutionSection } from './LinkedExecutionSection';
import { NextActionFooter } from './NextActionFooter';
import { PublicUpdateReviewModal } from './PublicUpdateReviewModal';
import { SimilarVocSection } from './SimilarVocSection';
import { TriageBlock } from './TriageBlock';
import { useVocDetailPanelController } from './useVocDetailPanelController';

export interface FullDetailViewProps {
  voc: VocDetailEnvelope;
  vocId: string;
  managedSystemId?: string;
  onClose: () => void;
  onExpandToggle?: () => void;
  isReporterOnOwnVoc: boolean;
  canRenderAllowedTask: boolean;
  me: MeResponse | null;
}

// Prototype deviation (screen-voc.jsx:175-185): issue #519 and the user's Option C decision
// pin the core navigation and move Description/Conversation into an overflow menu.
// Execution section only shown when there's an active finding/task (Slice 4+).
const STATIC_DETAIL_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'triage', label: 'Triage' },
  { id: 'description', label: 'Description', overflow: true },
  { id: 'trail', label: 'Trail' },
  { id: 'conversation', label: 'Conversation', overflow: true },
  { id: 'compose', label: 'Compose' },
];

export function FullDetailView({
  voc,
  vocId,
  managedSystemId,
  onClose,
  onExpandToggle,
  isReporterOnOwnVoc,
  canRenderAllowedTask,
  me,
}: FullDetailViewProps): React.ReactElement {
  const {
    setComposerDirty,
    dirtyConfirmOpen,
    createFindingOpen,
    setCreateFindingOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    reviewOpen,
    setReviewOpen,
    scrollRef,
    actorNamesById,
    analyticsAreasById,
    canTriage,
    canSeeInternalOps,
    linkedTask,
    requestTaskIsPending,
    pendingReviewCount,
    canCreateFinding,
    canRequestTask,
    showsSimilarVocSection,
    isReporterArm,
    handleClose,
    handleDirtyConfirm,
    handleDirtyCancel,
    closeRequestTaskDraft,
    handleRequestTaskSubmit,
    handleSimilarVocSelect,
    handleOpenTriage,
    handleOpenTask,
  } = useVocDetailPanelController({
    voc,
    vocId,
    onClose,
    canRenderAllowedTask,
    me,
    ...(managedSystemId !== undefined ? { managedSystemId } : {}),
  });

  const detailSections = isReporterArm
    ? STATIC_DETAIL_SECTIONS.filter((section) => section.id !== 'triage')
    : showsSimilarVocSection
      ? [
          ...STATIC_DETAIL_SECTIONS.slice(0, 4),
          { id: 'similar', label: 'Similar' },
          ...STATIC_DETAIL_SECTIONS.slice(4),
        ]
      : STATIC_DETAIL_SECTIONS;

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
          {!isReporterArm && (
            <div data-anchor="triage">
              <TriageBlock
                voc={voc}
                ownerDisplayName={
                  voc.owner_user_id != null ? (actorNamesById.get(voc.owner_user_id) ?? null) : null
                }
                analyticsAreaName={
                  voc.analytics_area_id != null
                    ? (analyticsAreasById.get(voc.analytics_area_id) ?? null)
                    : null
                }
                canTriage={canTriage}
                onOpenTriage={handleOpenTriage}
              />
            </div>
          )}
          <div data-anchor="description">
            <DescriptionSection voc={voc} isReporterOnOwnVoc={isReporterOnOwnVoc} />
            {/* Relocated metadata strip — severity/managed-system/AA/source-context
                chips moved out of the title block per .review/title-reference.png */}
            <IdentityMetadataStrip
              voc={voc}
              analyticsAreaName={
                voc.analytics_area_id != null
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
              onOpenTask={handleOpenTask}
            />
            {requestTaskOpen && (
              <TaskRequestDraftCard
                sourceKind="VOC"
                sourceDisplayId={voc.display_id}
                evidenceSummaryDefault={`VOC ${voc.display_id}: ${voc.title}`}
                isSubmitting={requestTaskIsPending}
                source={{ type: 'voc', id: vocId }}
                onClose={closeRequestTaskDraft}
                onSubmit={handleRequestTaskSubmit}
              />
            )}
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
            <ConversationTimeline
              voc={voc}
              canSeeInternalOps={canSeeInternalOps}
              actorNamesById={actorNamesById}
            />
          </div>
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

        <NextActionFooter
          voc={voc}
          overflowActions={[
            ...(canRequestTask
              ? [
                  {
                    label: 'Task 요청',
                    onClick: () => setRequestTaskOpen(true),
                    testId: 'voc-request-task-button',
                    afterMenuClose: true,
                  },
                ]
              : []),
            ...(canCreateFinding
              ? [{ label: 'Finding 생성', onClick: () => setCreateFindingOpen(true) }]
              : []),
          ]}
        />
      </div>

      <DirtyConfirmation
        open={dirtyConfirmOpen}
        onConfirm={handleDirtyConfirm}
        onCancel={handleDirtyCancel}
      />
      <CreateFindingModal
        vocId={vocId}
        managedSystemId={voc.primary_managed_system_id}
        sourceAnalyticsAreaId={voc.analytics_area_id ?? null}
        open={createFindingOpen}
        onClose={() => setCreateFindingOpen(false)}
      />
      <PublicUpdateReviewModal voc={voc} open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  );
}
