// IdentitySection — shared title block + status pill + reporter/time meta line.
// Managed System and source context live in the compact strip below the body.
// Reference: docs/design-prototype/screen-voc.jsx overview panel title.

import { useMe } from '@/lib/auth/useMe';
import { GLOSSARY } from '@/lib/copy/glossary';
import { useManagedSystem } from '@/lib/cross-system/useManagedSystem';
import { formatRelativeTime } from '@/lib/format/datetime';
import type { VocDetailEnvelope } from '@fops/shared';
import { ManagedSystemPill, OutlineBadge, PanelTitleBlock, ReporterStatusBadge } from '@fops/ui';
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
    (me?.actor.id === voc.reporter_id ? me.actor.display_name : GLOSSARY.unknownUser);
  const relativeTime = formatRelativeTime(voc.created_at);

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
      <PanelTitleBlock title={voc.title} inset="none" className="mb-1" />
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
// Compact chip array (managed-system / source-context). Severity stays in the
// row badge and Triage block; Analytics Area stays in Triage details.
export interface IdentityMetadataStripProps {
  voc: VocDetailEnvelope;
}

export function IdentityMetadataStrip({ voc }: IdentityMetadataStripProps): React.ReactElement {
  const managedSystem = useManagedSystem(voc.primary_managed_system_id);

  const sourceContextLabel = SOURCE_CONTEXT_LABELS[voc.source_context] ?? voc.source_context;

  return (
    <div className="flex flex-wrap gap-2 mt-3 text-xs">
      {managedSystem !== null && (
        <ManagedSystemPill name={managedSystem.name} mark={managedSystem.mark} />
      )}
      <OutlineBadge>{sourceContextLabel}</OutlineBadge>
    </div>
  );
}
