// TriageBlock — read-only triage fields; edits happen in the triage console (#363).

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import { PanelSectionTitle, FieldRow, SeverityBadge, UserChip, Button } from '@fops/ui';

export interface TriageBlockProps {
  voc: VocDetailEnvelope;
  ownerDisplayName?: string | null | undefined;
  analyticsAreaName?: string | null | undefined;
  canTriage: boolean;
  onOpenTriage: () => void;
}

export function TriageBlock({
  voc,
  ownerDisplayName,
  analyticsAreaName,
  canTriage,
  onOpenTriage,
}: TriageBlockProps): React.ReactElement {
  return (
    <div>
      <div className="flex items-center justify-between">
        <PanelSectionTitle>트리아지 (Read only)</PanelSectionTitle>
        {canTriage && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="triage-open-console"
            onClick={onOpenTriage}
          >
            트리아지에서 변경
          </Button>
        )}
      </div>

      {/* 심각도 */}
      <FieldRow label="심각도">
        {voc.severity !== null ? (
          <SeverityBadge severity={voc.severity} />
        ) : (
          <span className="text-text-muted text-sm">미설정</span>
        )}
      </FieldRow>

      {/* 담당자 */}
      <FieldRow label="담당자">
        {voc.owner_user_id !== null ? (
          <UserChip user={{ display_name: ownerDisplayName ?? 'Owner' }} size="sm" />
        ) : (
          <span className="text-sm text-feedback-error">Owner 없음</span>
        )}
      </FieldRow>

      {/* 분석 영역 */}
      <FieldRow label="분석 영역">
        {voc.analytics_area_id !== null ? (
          <span className="text-sm text-text-primary">{analyticsAreaName ?? 'Analytics area'}</span>
        ) : (
          <span className="text-sm text-feedback-warning">미지정</span>
        )}
      </FieldRow>

      {/* 트리아지 상태 */}
      <FieldRow label="트리아지 상태">
        <span className="text-sm text-text-primary">{voc.triage_state}</span>
      </FieldRow>
    </div>
  );
}
