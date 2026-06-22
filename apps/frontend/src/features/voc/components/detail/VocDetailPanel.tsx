// VocDetailPanel — orchestrator for the read-only VOC detail panel (Slice 3 #20 C8).
// REV-1 #6: dirty composer close now intercepted — DirtyConfirmation shown before panel close.

import * as React from 'react';
import { Button, Skeleton, PermissionBlockedPanel, DirtyConfirmation, DetailPanelSectionNav } from '@fops/ui';
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { useMe } from '@/lib/auth/useMe';

import { DetailHeader } from './DetailHeader';
import { IdentitySection, IdentityMetadataStrip } from './IdentitySection';
import { TriageBlock } from './TriageBlock';
import { DescriptionSection } from './DescriptionSection';
import { LinkedExecutionSection } from './LinkedExecutionSection';
import { LinkedEntityTrailSection } from './LinkedEntityTrailSection';
import { ConversationTimeline } from './ConversationTimeline';
import { ComposerSection } from './ComposerSection';
import { NextActionFooter } from './NextActionFooter';
import { DetailPanelNotFound } from './DetailPanelNotFound';
import { CreateFindingModal } from '@/features/integration/components/FindingDetail/CreateFindingModal';

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
  const isReporterOnOwnVoc =
    me?.actor.id === voc.reporter_id && voc.triage_state === 'untriaged';

  return (
    <FullDetailView
      voc={voc}
      vocId={vocId}
      onClose={onClose}
      {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      isReporterOnOwnVoc={isReporterOnOwnVoc}
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
  me: import('@/lib/auth/useMe').MeResponse | null;
}

// Prototype ref (screen-voc.jsx:172-182): section IDs for the detail panel.
// Execution section only shown when there's an active finding/task (Slice 4+).
// For Slice 3, show all static sections; Internal tab maps to the internal
// conversation tab in ConversationTimeline.
const DETAIL_SECTIONS = [
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
  me,
}: FullDetailViewProps): React.ReactElement {
  // REV-1 #6: track composer dirty state; intercept panel close to show DirtyConfirmation.
  const [composerDirty, setComposerDirty] = React.useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = React.useState(false);
  const [createFindingOpen, setCreateFindingOpen] = React.useState(false);
  // Scroll container ref for section nav anchor tracking
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // FE display hint only (ADR-0024 §C): gate button to Admin or Developer.
  const canCreateFinding =
    me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

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
        <DetailPanelSectionNav sections={DETAIL_SECTIONS} scrollRef={scrollRef} />

        <div ref={scrollRef} className="flex flex-col flex-1 min-h-0 overflow-y-auto pt-7 px-6 pb-16">
          <div data-anchor="overview"><IdentitySection voc={voc} /></div>
          <div data-anchor="triage"><TriageBlock voc={voc} /></div>
          <div data-anchor="description">
            <DescriptionSection voc={voc} isReporterOnOwnVoc={isReporterOnOwnVoc} />
            {/* Relocated metadata strip — severity/managed-system/AA/source-context
                chips moved out of the title block per .review/title-reference.png */}
            <IdentityMetadataStrip voc={voc} />
          </div>
          <div data-anchor="trail"><LinkedExecutionSection voc={voc} /><LinkedEntityTrailSection /></div>
          <div data-anchor="conversation"><ConversationTimeline voc={voc} /></div>
          <div data-anchor="internal" />
          <div data-anchor="compose"><ComposerSection voc={voc} me={me} onDirtyChange={setComposerDirty} /></div>
        </div>

        <NextActionFooter voc={voc} />
        {canCreateFinding && (
          <div className="px-4 pb-3 flex justify-end border-t border-border-subtle pt-2">
            <Button variant="outline" size="sm" onClick={() => setCreateFindingOpen(true)}>
              Finding 생성
            </Button>
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
            {...(selfDecision.requiredScope !== undefined ? { requiredScope: selfDecision.requiredScope } : {})}
            {...(selfDecision.decisionId !== undefined ? { decisionId: selfDecision.decisionId } : {})}
          />
        ) : (
          <PermissionBlockedPanel state="denied" category="VOC 상세" />
        )}
      </div>
    </div>
  );
}

