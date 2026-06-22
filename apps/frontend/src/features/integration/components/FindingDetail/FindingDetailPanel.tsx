// FindingDetailPanel — state machine for the Finding detail page.
// States: loading skeleton → not-found → permission-blocked → full detail.
// Mirrors VocDetailPanel structure per domain-module-boundaries §Frontend Boundary Rules.

import * as React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Button,
  PermissionBlockedPanel,
  Skeleton,
  SeverityBadge,
  OutlineBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type SeverityEnum,
} from '@fops/ui';
import { useFindingDetail } from '../../hooks/useFindingDetail';
import type { FindingDto } from '@fops/shared';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  findingId: string;
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function FindingDetailSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Finding 상세 불러오는 중">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────

function FindingNotFound(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <p className="text-base font-semibold text-text-primary">Finding을 찾을 수 없습니다.</p>
      <p className="text-sm text-text-muted">
        해당 Finding은 삭제되었거나 접근 권한이 없습니다.
      </p>
      <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/vocs' })}>
        VOC 목록으로
      </Button>
    </div>
  );
}

// ── Disabled CTA with Slice 6 tooltip ───────────────────────────────────────

function Slice6Cta({ label }: { label: string }): React.ReactElement {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size="sm" disabled>
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Slice 6에서 지원 예정입니다.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Source type label map ────────────────────────────────────────────────────

const SOURCE_TYPE_LABEL: Record<string, string> = {
  voc: 'VOC',
  voc_cluster: 'VOC Cluster',
  survey: 'Survey',
  manual: 'Manual',
};

// ── Section divider ──────────────────────────────────────────────────────────

function SectionDivider(): React.ReactElement {
  return <hr className="border-border-subtle" />;
}

// ── Full detail view ─────────────────────────────────────────────────────────

interface FullFindingDetailProps {
  finding: FindingDto;
}

function FullFindingDetail({ finding }: FullFindingDetailProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <OutlineBadge>Finding</OutlineBadge>
          <span className="text-xs text-text-muted">{finding.id.slice(0, 8)}</span>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">{finding.title}</h1>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {/* Summary */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">요약</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{finding.summary}</p>
        </div>

        <SectionDivider />

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">소스 유형</p>
            <OutlineBadge>{SOURCE_TYPE_LABEL[finding.source_type] ?? finding.source_type}</OutlineBadge>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">심각도</p>
            <SeverityBadge severity={finding.severity as SeverityEnum} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">신뢰도</p>
            <span className="text-sm text-text-primary">
              {finding.confidence ?? <span className="text-text-muted">—</span>}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide">상태</p>
            <OutlineBadge>{finding.status}</OutlineBadge>
          </div>
        </div>

        <SectionDivider />

        {/* Primary Managed System */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Primary Managed System</p>
          <span className="text-sm text-text-primary font-mono">{finding.primary_managed_system_id}</span>
        </div>

        {/* Affected Analytics Area */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Affected Analytics Area</p>
          {finding.analytics_area_id !== null ? (
            <span className="text-sm text-text-primary font-mono">{finding.analytics_area_id}</span>
          ) : (
            <span className="text-sm text-text-muted">—</span>
          )}
        </div>

        <SectionDivider />

        {/* Linked VOC — why this Finding exists */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Linked VOC</p>
          {finding.source_type === 'voc' && finding.source_id !== null ? (
            <Link
              to="/vocs"
              search={{ view: 'inbox', selected: finding.source_id }}
              className="inline-flex items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
            >
              VOC {finding.source_id.slice(0, 8)}…
            </Link>
          ) : (
            <span className="text-sm text-text-muted">—</span>
          )}
        </div>

        {/* Linked Task */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Linked Task</p>
          {finding.linked_task_id !== null ? (
            <span className="text-sm text-text-primary font-mono">{finding.linked_task_id}</span>
          ) : (
            <span className="text-sm text-text-muted">—</span>
          )}
        </div>

        <SectionDivider />

        {/* Evidence Highlights — placeholder (#125 fills this) */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Evidence Highlights ({finding.evidence_count})
          </p>
          <div className="rounded-md border border-dashed border-border-subtle bg-surface-card p-6 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-text-muted">증거 하이라이트가 없습니다.</p>
            <p className="text-xs text-text-muted">Add Evidence 버튼으로 증거를 추가하세요.</p>
          </div>
        </div>
      </div>

      {/* CTA Footer */}
      <div className="sticky bottom-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-wrap items-center gap-2">
        {/* Add Evidence / Link Existing Evidence — active (shell only; #125 wires the form) */}
        <Button variant="default" size="sm" disabled>
          Add Evidence
        </Button>
        <Button variant="outline" size="sm" disabled>
          Link Existing Evidence
        </Button>
        {/* Request Task / Mark Not Actionable — Slice 6 */}
        <Slice6Cta label="Request Task" />
        <Slice6Cta label="Mark Not Actionable" />
      </div>
    </div>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function FindingDetailPanel({ findingId }: FindingDetailPanelProps): React.ReactElement {
  const { data, isLoading, isError, error } = useFindingDetail(findingId);

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="h-12 border-b border-border-subtle flex items-center px-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <FindingDetailSkeleton />
      </div>
    );
  }

  // 2. Error
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return <FindingNotFound />;
    }
    // permission.denied → finding.read blocked
    if (code === 'permission.denied') {
      return (
        <div className="flex flex-col h-full">
          <div className="h-12 border-b border-border-subtle flex items-center px-6">
            <span className="text-sm font-medium text-text-primary">Finding 상세</span>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <PermissionBlockedPanel
              state="denied"
              category="Finding 상세"
              reason="finding.read 권한이 없습니다. 해당 Managed System의 Developer 이상 권한이 필요합니다."
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-feedback-error">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!data) {
    return <FindingNotFound />;
  }

  // 3. Full detail
  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="finding-detail-panel">
      <FullFindingDetail finding={data} />
    </div>
  );
}
