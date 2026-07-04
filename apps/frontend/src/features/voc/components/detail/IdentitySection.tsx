// IdentitySection — shared title block + status pill + reporter/time meta line.
// Verbose badge stack + FieldRow '제출자' / '제출 시각' relocated to a single
// compact metadata strip below the body card.
// Reference: docs/design-prototype/screen-voc.jsx overview panel title.

import { formatVocCreatedAt } from '@/features/voc/components/list/VocRow';
import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { useMe } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import {
  ManagedSystemPill,
  OutlineBadge,
  PanelTitleBlock,
  ReporterStatusBadge,
  SeverityBadge,
} from '@fops/ui';
import type * as React from 'react';

// ── Source context labels ────────────────────────────────────────────────────

const SOURCE_CONTEXT_LABELS: Record<string, string> = {
  direct_use: '직접 사용',
  proxy_report: '타인 대신 보고',
  operational_discovery: '운영 중 발견',
  stakeholder_request: '이해관계자 요청',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface IdentitySectionProps {
  voc: VocDetailEnvelope;
  reporterDisplayName?: string | undefined;
}

// ── Component ────────────────────────────────────────────────────────────────

export function IdentitySection({
  voc,
  reporterDisplayName,
}: IdentitySectionProps): React.ReactElement {
  const { data: me } = useMe();
  const resolvedReporterDisplayName =
    reporterDisplayName ??
    (me?.actor.id === voc.reporter_id ? me.actor.display_name : 'Reporter');
  const relativeTime = formatVocCreatedAt(voc.created_at);

  // Title block: prototype .panel-title typography via PanelTitleBlock.
  // Rhythm:
  //   - pt-2  (8 px)  — top inset (reference shows ~8 px from panel top).
  //   - mb-4  (16 px) — gap to next section, matches reference badge→BODY (~16 CSS).
  //   - title mb-1 (4 px) — tight gap to the status row (reference ≈ 8 CSS but
  //     visually feels too wide once the pill carries weight; user feedback
  //     "제목과 뱃지/날짜 간격 너무 넓음").
  //   - horizontal inset now provided by the scroll container (pt-7 px-6 in VocDetailPanel).
  return (
    <div className="mb-4 pt-2">
      <PanelTitleBlock title={voc.title} className="!px-0 !py-0 mb-1" />
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <ReporterStatusBadge status={voc.reporter_facing_status} />
        <span aria-hidden="true">·</span>
        <span>{resolvedReporterDisplayName}</span>
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
  analyticsAreaName?: string | null | undefined;
}

export function IdentityMetadataStrip({
  voc,
  analyticsAreaName,
}: IdentityMetadataStripProps): React.ReactElement | null {
  const managedSystem = useManagedSystem(voc.primary_managed_system_id);

  const sourceContextLabel = SOURCE_CONTEXT_LABELS[voc.source_context] ?? voc.source_context;

  const hasSeverity = voc.severity !== null;
  const hasAnalyticsArea = voc.analytics_area_id !== null;
  const hasManagedSystem = managedSystem !== null;
  const severity = voc.severity;
  const analyticsAreaId = voc.analytics_area_id;

  if (!hasSeverity && !hasManagedSystem && !hasAnalyticsArea) {
    // Source context always renders, so we always have at least one chip.
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3 text-xs">
      {hasSeverity && severity !== null && <SeverityBadge severity={severity} />}
      {hasManagedSystem && (
        <ManagedSystemPill name={managedSystem.name} mark={managedSystem.mark} />
      )}
      {hasAnalyticsArea && analyticsAreaId !== null && (
        <OutlineBadge>{analyticsAreaName ?? 'Analytics area'}</OutlineBadge>
      )}
      <OutlineBadge>{sourceContextLabel}</OutlineBadge>
    </div>
  );
}
