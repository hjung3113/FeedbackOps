// IdentitySection — title + badges + identity FieldRows.

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import {
  PanelTitleBlock,
  FieldRow,
  ReporterStatusBadge,
  SeverityBadge,
  ManagedSystemPill,
  OutlineBadge,
  UserChip,
} from '@fops/ui';
import { useMe } from '@/lib/auth/useMe';
import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { formatVocCreatedAt } from '@/features/voc/components/list/VocRow';

// ── Source context labels ────────────────────────────────────────────────────

const SOURCE_CONTEXT_LABELS: Record<string, string> = {
  direct_use:             '직접 사용',
  proxy_report:           '타인 대신 보고',
  operational_discovery:  '운영 중 발견',
  stakeholder_request:    '이해관계자 요청',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface IdentitySectionProps {
  voc: VocDetailEnvelope;
}

// ── Component ────────────────────────────────────────────────────────────────

export function IdentitySection({ voc }: IdentitySectionProps): React.ReactElement {
  const { data: me } = useMe();
  const managedSystem = useManagedSystem(voc.primary_managed_system_id);

  // Reporter resolution: if the current actor IS the reporter, use real name;
  // otherwise fall back to a truncated-ID stub (no actor-lookup API in Slice 3).
  const reporterUser: { display_name: string } =
    me?.actor.id === voc.reporter_id
      ? { display_name: me.actor.display_name }
      : { display_name: `Actor ${voc.reporter_id.slice(0, 8)}` };

  const sourceContextLabel =
    SOURCE_CONTEXT_LABELS[voc.source_context] ?? voc.source_context;

  const badges = (
    <>
      <ReporterStatusBadge status={voc.reporter_facing_status} />
      {voc.severity !== null && <SeverityBadge severity={voc.severity} />}
      {managedSystem !== null && (
        <ManagedSystemPill name={managedSystem.name} mark={managedSystem.mark} />
      )}
      {voc.analytics_area_id !== null && (
        <OutlineBadge>{voc.analytics_area_id.slice(0, 8)}</OutlineBadge>
      )}
      <OutlineBadge>{sourceContextLabel}</OutlineBadge>
    </>
  );

  return (
    <div>
      <PanelTitleBlock title={voc.title} badges={badges} />
      <FieldRow label="제출자">
        <UserChip user={reporterUser} size="sm" />
      </FieldRow>
      <FieldRow label="제출 시각">
        {formatVocCreatedAt(voc.created_at)}
      </FieldRow>
    </div>
  );
}
