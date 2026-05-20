// OutOfScopeSummaryBanner — "Out-of-scope VOCs · summary peek" banner.
// Prototype ref: screen-voc-create.jsx:672-687
// Renders above the triage queue list when the backend signals filtered-out VOCs.

import * as React from 'react';
import { PermissionBlockedPanel } from '@fops/ui';

export interface OutOfScopeSummaryBannerProps {
  count: number;
  severityDistribution: Record<string, number>;
  className?: string;
}

export function OutOfScopeSummaryBanner({
  count,
  severityDistribution,
  className,
}: OutOfScopeSummaryBannerProps): React.ReactElement {
  const severityKeys = Object.keys(severityDistribution);

  return (
    <div className={className}>
      <PermissionBlockedPanel
        state="summary_visible"
        category="Out-of-scope VOCs · summary peek"
        summary={
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">
              Triage 큐에 보이지 않는{' '}
              <strong className="text-accent-primary">{count}건</strong>의 untriaged VOC가
              있습니다.
            </span>
            <span className="text-xs text-text-muted">
              Managed System 권한 밖이며, severity 분포만 노출됩니다 ·{' '}
              {severityKeys.join(' · ')}
            </span>
          </div>
        }
      />
    </div>
  );
}

OutOfScopeSummaryBanner.displayName = 'OutOfScopeSummaryBanner';
