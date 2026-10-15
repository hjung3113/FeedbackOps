import { VOC_READ_PERMISSION_REASONS } from '@/lib/copy/permission-reasons';
import { getSummarySelfDecision } from '@/lib/cross-system/getPermissionDecision';
import type { VocSummaryEnvelope } from '@fops/shared';
import { PermissionBlockedPanel } from '@fops/ui';
import type * as React from 'react';

import { DetailHeader } from './DetailHeader';

export interface SummaryPermissionViewProps {
  data: VocSummaryEnvelope;
  vocId: string;
  onClose: () => void;
}

export function SummaryPermissionView({
  data,
  vocId,
  onClose,
}: SummaryPermissionViewProps): React.ReactElement {
  const selfDecision = getSummarySelfDecision(data);
  const reason =
    selfDecision.reason !== undefined &&
    Object.hasOwn(VOC_READ_PERMISSION_REASONS, selfDecision.reason)
      ? VOC_READ_PERMISSION_REASONS[selfDecision.reason]
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <DetailHeader vocId={vocId} displayId={data.display_id} onClose={onClose} />
      <div className="flex-1 flex items-center justify-center p-4">
        {selfDecision !== null ? (
          <PermissionBlockedPanel
            state={selfDecision.state}
            category="VOC 상세"
            {...(reason !== undefined ? { reason } : {})}
            {...(selfDecision.required_scope !== undefined
              ? { requiredScope: selfDecision.required_scope }
              : {})}
            {...(selfDecision.decision_id !== undefined
              ? { decisionId: selfDecision.decision_id }
              : {})}
          />
        ) : (
          <PermissionBlockedPanel state="denied" category="VOC 상세" />
        )}
      </div>
    </div>
  );
}
