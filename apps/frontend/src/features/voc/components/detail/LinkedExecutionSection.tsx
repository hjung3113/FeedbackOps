// LinkedExecutionSection — linked finding/task block (Slice 3 always empty).

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import { PanelSectionTitle, EmptyState, PermissionBlockedPanel } from '@fops/ui';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';

export interface LinkedExecutionSectionProps {
  voc: VocDetailEnvelope;
}

export function LinkedExecutionSection({ voc }: LinkedExecutionSectionProps): React.ReactElement {
  const linkedFindingDecision = usePermissionDecision(voc, 'linkedFinding');

  if (linkedFindingDecision !== null) {
    return (
      <div>
        <PanelSectionTitle>연결된 실행</PanelSectionTitle>
        <PermissionBlockedPanel
          state={linkedFindingDecision.state}
          category="Linked Finding"
          {...(linkedFindingDecision.reason !== undefined ? { reason: linkedFindingDecision.reason } : {})}
          {...(linkedFindingDecision.requiredScope !== undefined ? { requiredScope: linkedFindingDecision.requiredScope } : {})}
          {...(linkedFindingDecision.decisionId !== undefined ? { decisionId: linkedFindingDecision.decisionId } : {})}
        />
      </div>
    );
  }

  return (
    <div>
      <PanelSectionTitle>연결된 실행</PanelSectionTitle>
      <EmptyState
        size="sm"
        title="아직 연결된 Finding/Task가 없습니다."
        body="(Slice 4/5에서 활성화)"
      />
    </div>
  );
}
