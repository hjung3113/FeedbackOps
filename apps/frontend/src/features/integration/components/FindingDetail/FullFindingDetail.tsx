// FullFindingDetail — composition/rendering for a loaded Finding.
// Pure view: all state, queries and handlers come from useFindingDetailController.

import { ProgressNotesSection } from '@/features/cross-system/progress-notes/ProgressNotesSection';
import type { FindingDto, FindingStatus } from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  PanelSectionTitle,
  SeverityBadge,
  type SeverityEnum,
  UserChip,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import type * as React from 'react';
import { AddEvidenceModal } from './AddEvidenceModal';
import { EvidenceHighlightsSection } from './EvidenceHighlights';
import { LinkEvidenceModal } from './LinkEvidenceModal';
import { LinkTaskModal } from './LinkTaskModal';
import { RequestTaskModal } from './RequestTaskModal';
import { FitBadge, SectionDivider, shortId } from './detail-primitives';
import { useFindingDetailController } from './useFindingDetailController';

// ── Source type label map ────────────────────────────────────────────────────

const SOURCE_TYPE_LABEL: Record<string, string> = {
  voc: 'VOC',
  voc_cluster: 'VOC Cluster',
  survey: 'Survey',
  manual: 'Manual',
};

const FINDING_STATUS_LABEL: Record<FindingDto['status'], string> = {
  draft: '초안',
  active: '진행 중',
  not_actionable: '조치 불필요',
  converted: 'Task 전환됨',
  archived: '보관됨',
};

const CONFIDENCE_LABEL: Record<NonNullable<FindingDto['confidence']>, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};
// ── Full detail view ─────────────────────────────────────────────────────────

interface FullFindingDetailProps {
  finding: FindingDto;
}
export function FullFindingDetail({ finding }: FullFindingDetailProps): React.ReactElement {
  const {
    sections: DETAIL_SECTIONS,
    scrollRef,
    addEvidenceOpen,
    setAddEvidenceOpen,
    linkEvidenceOpen,
    setLinkEvidenceOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    linkTaskOpen,
    setLinkTaskOpen,
    actorsById,
    managedSystemsById,
    analyticsAreasById,
    linkedVocTitle,
    linkedVocDisplayId,
    linkedTaskQuery,
    canManage,
    handleMarkNotActionable,
    markNotActionableDisabled,
  } = useFindingDetailController(finding);

  return (
    <>
      <div className="flex h-full flex-col" data-testid="finding-detail-panel">
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <FitBadge>Finding</FitBadge>
            <span className="text-xs text-text-muted">{finding.display_id}</span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">{finding.title}</h1>
        </div>

        <DetailPanelSectionNav sections={DETAIL_SECTIONS} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          {/* Summary */}
          <div data-anchor="summary" className="flex flex-col gap-1">
            <PanelSectionTitle>요약</PanelSectionTitle>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{finding.summary}</p>
          </div>

          <SectionDivider />

          {/* Metadata grid — Source Type / Severity / Confidence / Status */}
          <div data-anchor="metadata" className="flex flex-col gap-2">
            <PanelSectionTitle>소스 / 심각도 / 신뢰도</PanelSectionTitle>
            <FieldRow label="소스 유형" className="px-0">
              <FitBadge>{SOURCE_TYPE_LABEL[finding.source_type] ?? finding.source_type}</FitBadge>
            </FieldRow>
            <FieldRow label="심각도" className="px-0">
              <SeverityBadge severity={finding.severity as SeverityEnum} />
            </FieldRow>
            <FieldRow label="신뢰도" className="px-0">
              {finding.confidence !== null ? (
                CONFIDENCE_LABEL[finding.confidence]
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <FitBadge>{FINDING_STATUS_LABEL[finding.status]}</FitBadge>
            </FieldRow>
            <FieldRow label="생성자" className="px-0">
              <UserChip
                user={{ display_name: actorsById.get(finding.created_by) ?? 'Finding creator' }}
                size="sm"
              />
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Evidence Highlights — per design/05 layout: after Summary/Source/Severity/Confidence */}
          <div data-anchor="evidence" className="flex flex-col gap-3">
            <PanelSectionTitle>Evidence Highlights ({finding.evidence_count})</PanelSectionTitle>
            <EvidenceHighlightsSection
              findingId={finding.id}
              evidenceCount={finding.evidence_count}
            />
          </div>

          <SectionDivider />

          {/* Primary Managed System */}
          <div data-anchor="managed-system" className="flex flex-col gap-2">
            <PanelSectionTitle>Primary Managed System</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <ManagedSystemPill
                name={managedSystemsById.get(finding.primary_managed_system_id) ?? 'Managed System'}
              />
            </FieldRow>
          </div>

          {/* Affected Analytics Area */}
          <div data-anchor="analytics-area" className="flex flex-col gap-2">
            <PanelSectionTitle>Affected Analytics Area</PanelSectionTitle>
            <FieldRow label="Analytics Area" className="px-0">
              {finding.analytics_area_id !== null ? (
                <FitBadge>
                  {analyticsAreasById.get(finding.analytics_area_id) ?? 'Analytics Area'}
                </FitBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Linked VOC — why this Finding exists */}
          <div data-anchor="links" className="flex flex-col gap-2">
            <PanelSectionTitle>Linked VOC / Task</PanelSectionTitle>
            <FieldRow label="Linked VOC" className="px-0">
              {finding.source_type === 'voc' && finding.source_id !== null ? (
                <Link
                  to="/vocs"
                  search={{ view: 'inbox', selected: finding.source_id }}
                  className="inline-flex items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                >
                  <span>{linkedVocTitle ?? 'Linked VOC'}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedVocDisplayId ?? shortId(finding.source_id)}
                  </span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Linked Task" className="px-0">
              {finding.linked_task_id !== null ? (
                <Link
                  to="/tasks"
                  search={{ view: 'backlog', param: finding.linked_task_id }}
                  className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                >
                  <span>{linkedTaskQuery.data?.title ?? 'Linked task'}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedTaskQuery.data?.display_id ?? shortId(finding.linked_task_id)}
                  </span>
                  <span className="text-xs text-text-muted">jump</span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Progress notes (#377) — timeline visible to any finding reader;
              composer gated to finding.manage (backend authoritative). */}
          <div data-anchor="notes" className="flex flex-col gap-2">
            <PanelSectionTitle>진행 메모</PanelSectionTitle>
            <ProgressNotesSection
              resource={{ kind: 'finding', id: finding.id }}
              canCompose={canManage}
              actorNamesById={actorsById}
              renderStatusBadge={(status: FindingStatus) => (
                <FitBadge>{FINDING_STATUS_LABEL[status]}</FitBadge>
              )}
            />
          </div>
        </div>

        {/* CTA Footer */}
        <div className="sticky bottom-0 shrink-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-wrap items-center gap-2">
          {/* Add Evidence — gated to finding.manage; backend authoritative */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setAddEvidenceOpen(true)}
            disabled={!canManage}
            data-testid="add-evidence-btn"
          >
            Evidence 추가
          </Button>

          {/* Link Existing Evidence — gated to finding.manage; backend authoritative */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLinkEvidenceOpen(true)}
            disabled={!canManage}
            data-testid="link-evidence-btn"
          >
            기존 Evidence 연결
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRequestTaskOpen(true)}
            disabled={!canManage}
            data-testid="request-task-btn"
          >
            Task 요청
          </Button>
          {finding.linked_task_id === null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkTaskOpen(true)}
              disabled={!canManage}
              data-testid="link-task-btn"
            >
              Task 연결
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkNotActionable}
            disabled={markNotActionableDisabled}
            data-testid="mark-not-actionable-btn"
          >
            조치 불필요 표시
          </Button>
        </div>
      </div>

      {/* Modals */}
      <AddEvidenceModal
        findingId={finding.id}
        open={addEvidenceOpen}
        onClose={() => setAddEvidenceOpen(false)}
      />
      <LinkEvidenceModal
        findingId={finding.id}
        open={linkEvidenceOpen}
        onClose={() => setLinkEvidenceOpen(false)}
      />
      <RequestTaskModal
        finding={finding}
        open={requestTaskOpen}
        onClose={() => setRequestTaskOpen(false)}
      />
      <LinkTaskModal finding={finding} open={linkTaskOpen} onClose={() => setLinkTaskOpen(false)} />
    </>
  );
}
