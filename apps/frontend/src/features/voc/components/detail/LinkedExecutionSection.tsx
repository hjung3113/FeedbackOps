// LinkedExecutionSection — linked finding/task block (Slice 3 always empty).

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import { PanelSectionTitle, EmptyState, PermissionBlockedPanel, OutlineBadge } from '@fops/ui';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';

export interface LinkedExecutionSectionProps {
  voc: VocDetailEnvelope;
  linkedTask?: { title: string; status: string } | null;
  /** A reporter-safe Task summary renders in the following related-entity section. */
  hasReporterTaskSummary?: boolean;
}

export function LinkedExecutionSection({
  voc,
  linkedTask = null,
  hasReporterTaskSummary = false,
}: LinkedExecutionSectionProps): React.ReactElement {
  const linkedFindingDecision = usePermissionDecision(voc, 'linkedFinding');

  if (linkedFindingDecision !== null) {
    return (
      <div>
        <PanelSectionTitle>연결된 실행</PanelSectionTitle>
        <PermissionBlockedPanel
          state={linkedFindingDecision.state}
          category="Linked Finding"
          {...(linkedFindingDecision.reason !== undefined
            ? { reason: linkedFindingDecision.reason }
            : {})}
          {...(linkedFindingDecision.requiredScope !== undefined
            ? { requiredScope: linkedFindingDecision.requiredScope }
            : {})}
          {...(linkedFindingDecision.decisionId !== undefined
            ? { decisionId: linkedFindingDecision.decisionId }
            : {})}
        />
      </div>
    );
  }

  return (
    <div>
      <PanelSectionTitle>연결된 실행</PanelSectionTitle>
      {linkedTask !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle bg-surface-card px-3 py-2">
          <span className="text-sm font-medium text-text-primary">{linkedTask.title}</span>
          <OutlineBadge>{linkedTask.status}</OutlineBadge>
        </div>
      ) : !hasReporterTaskSummary ? (
        <EmptyState size="sm" title="연결된 실행 없음" />
      ) : null}
    </div>
  );
}
