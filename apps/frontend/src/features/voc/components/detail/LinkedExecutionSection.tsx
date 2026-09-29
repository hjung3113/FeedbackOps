// LinkedExecutionSection — linked finding/task block (Slice 3 always empty).

import type { VocDetailEnvelope } from '@fops/shared';
import { EmptyState, OutlineBadge, PanelSectionTitle, PermissionBlockedPanel } from '@fops/ui';
import type * as React from 'react';

import { getPermissionDecision } from '@/lib/cross-system/getPermissionDecision';

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
  const linkedFindingDecision = getPermissionDecision(voc, 'linkedFinding');

  if (linkedFindingDecision !== null) {
    return (
      <div>
        <PanelSectionTitle>연결된 실행</PanelSectionTitle>
        <PermissionBlockedPanel
          state={linkedFindingDecision.state}
          category="Linked Finding"
          // #564: request_access now renders reason, and this decision's reason is a
          // machine code (e.g. developer_outside_managed_system_scope), so keep it out there.
          {...(linkedFindingDecision.reason !== undefined &&
          linkedFindingDecision.state !== 'request_access'
            ? { reason: linkedFindingDecision.reason }
            : {})}
          {...(linkedFindingDecision.required_scope !== undefined
            ? { requiredScope: linkedFindingDecision.required_scope }
            : {})}
          {...(linkedFindingDecision.decision_id !== undefined
            ? { decisionId: linkedFindingDecision.decision_id }
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
