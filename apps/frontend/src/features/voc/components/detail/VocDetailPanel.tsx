// VocDetailPanel — orchestrator for the read-only VOC detail panel (Slice 3 #20 C8).

import * as React from 'react';
import { Skeleton, PermissionBlockedPanel } from '@fops/ui';
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { useMe } from '@/lib/auth/useMe';

import { DetailHeader } from './DetailHeader';
import { IdentitySection } from './IdentitySection';
import { TriageBlock } from './TriageBlock';
import { DescriptionSection } from './DescriptionSection';
import { LinkedExecutionSection } from './LinkedExecutionSection';
import { LinkedEntityTrailSection } from './LinkedEntityTrailSection';
import { ConversationTimeline } from './ConversationTimeline';
import { NextActionFooter } from './NextActionFooter';
import { DetailPanelNotFound } from './DetailPanelNotFound';

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
    <div className="flex flex-col h-full overflow-y-auto" data-testid="voc-detail-panel">
      <DetailHeader
        vocId={vocId}
        displayId={voc.display_id}
        onClose={onClose}
        {...(onExpandToggle !== undefined ? { onExpandToggle } : {})}
      />

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto pb-16">
        <IdentitySection voc={voc} />
        <TriageBlock voc={voc} />
        <DescriptionSection voc={voc} isReporterOnOwnVoc={isReporterOnOwnVoc} />
        <LinkedExecutionSection voc={voc} />
        <LinkedEntityTrailSection />
        <ConversationTimeline voc={voc} />
      </div>

      <NextActionFooter voc={voc} />
    </div>
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

