// TriageBlock — read-only triage fields; edits happen in the triage console (#363).

import { TRIAGE_STATE_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { VocDetailEnvelope } from '@fops/shared';
import {
  Button,
  FieldRow,
  PanelSectionTitle,
  SeverityBadge,
  UnassignedBadge,
  UserChip,
} from '@fops/ui';
import type * as React from 'react';

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
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <PanelSectionTitle>Triage (읽기 전용)</PanelSectionTitle>
        {canTriage && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="triage-open-console"
            onClick={onOpenTriage}
          >
            Triage에서 변경
          </Button>
        )}
      </div>

      {/* 심각도 */}
      <FieldRow label="심각도" inset="none">
        {voc.severity !== null ? (
          <SeverityBadge severity={voc.severity} />
        ) : (
          <span className="text-text-muted text-sm">미설정</span>
        )}
      </FieldRow>

      {/* 담당자 */}
      <FieldRow label="담당자" inset="none">
        {voc.owner_user_id !== null ? (
          <UserChip user={{ display_name: ownerDisplayName ?? GLOSSARY.owner }} size="sm" />
        ) : (
          <UnassignedBadge />
        )}
      </FieldRow>

      {/* Analytics Area */}
      <FieldRow label="Analytics Area" inset="none">
        {voc.analytics_area_id !== null ? (
          <span className="text-sm text-text-primary">{analyticsAreaName ?? 'Analytics Area'}</span>
        ) : (
          <span className="text-sm text-text-warning">미지정</span>
        )}
      </FieldRow>

      {/* Triage 상태 */}
      <FieldRow label="Triage 상태" inset="none">
        <span className="text-sm text-text-primary">{TRIAGE_STATE_LABELS[voc.triage_state]}</span>
      </FieldRow>
    </div>
  );
}
