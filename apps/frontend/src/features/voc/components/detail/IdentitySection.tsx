// IdentitySection — title block (xl) + status pill + reporter/time meta line.
// Verbose badge stack + FieldRow '제출자' / '제출 시각' relocated to a single
// compact metadata strip below the body card.
// Reference: .review/title-reference.png (user-supplied target layout).

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import {
  PanelTitleBlock,
  ReporterStatusBadge,
  SeverityBadge,
  ManagedSystemPill,
  OutlineBadge,
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
  const reporterDisplayName: string =
    me?.actor.id === voc.reporter_id
      ? me.actor.display_name
      : `Actor ${voc.reporter_id.slice(0, 8)}`;

  const relativeTime = formatVocCreatedAt(voc.created_at);

  // Title block: xl typography per reference; no badge slot here — the
  // status pill + meta line lives in its own row below the title.
  // mb-7 (28px) matches the spacing scale and the reference rhythm between
  // the title group and the BODY card.
  return (
    <div className="mb-7 px-4 pt-3">
      <PanelTitleBlock title={voc.title} size="xl" className="!px-0 !py-0 mb-2" />
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <ReporterStatusBadge status={voc.reporter_facing_status} />
        <span aria-hidden="true">·</span>
        <span>{reporterDisplayName}</span>
        <span aria-hidden="true">·</span>
        <span>{relativeTime}</span>
      </div>
    </div>
  );
}

// ── Metadata strip ───────────────────────────────────────────────────────────
// Compact chip array (severity / managed-system / analytics-area / source-context).
// Rendered by VocDetailPanel immediately below the DescriptionSection so the
// information stays visible but no longer competes with the title.
export interface IdentityMetadataStripProps {
  voc: VocDetailEnvelope;
}

export function IdentityMetadataStrip({ voc }: IdentityMetadataStripProps): React.ReactElement | null {
  const managedSystem = useManagedSystem(voc.primary_managed_system_id);

  const sourceContextLabel =
    SOURCE_CONTEXT_LABELS[voc.source_context] ?? voc.source_context;

  const hasSeverity = voc.severity !== null;
  const hasAnalyticsArea = voc.analytics_area_id !== null;
  const hasManagedSystem = managedSystem !== null;

  if (!hasSeverity && !hasManagedSystem && !hasAnalyticsArea) {
    // Source context always renders, so we always have at least one chip.
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 mt-3 text-xs">
      {hasSeverity && <SeverityBadge severity={voc.severity!} />}
      {hasManagedSystem && (
        <ManagedSystemPill name={managedSystem.name} mark={managedSystem.mark} />
      )}
      {hasAnalyticsArea && (
        <OutlineBadge>{voc.analytics_area_id!.slice(0, 8)}</OutlineBadge>
      )}
      <OutlineBadge>{sourceContextLabel}</OutlineBadge>
    </div>
  );
}
