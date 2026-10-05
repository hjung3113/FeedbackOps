// FullFindingDetail — composition/rendering for a loaded Finding.
// Detail and execution state live in their Finding-owned section controllers.

import { ProgressNotesSection } from '@/features/cross-system/progress-notes/ProgressNotesSection';
import {
  FINDING_CONFIDENCE_LABELS,
  FINDING_SOURCE_TYPE_LABELS,
  FINDING_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { shortId } from '@/lib/identity';
import type { FindingDto, FindingStatus } from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  PanelSectionTitle,
  PanelTitleBlock,
  SeverityBadge,
  type SeverityEnum,
  UserChip,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import type * as React from 'react';
import { AddEvidenceModal } from './AddEvidenceModal';
import { EvidenceHighlightsSection } from './EvidenceHighlights';
import {
  FindingExecutionRequestActions,
  FindingExecutionRequestDraftSlot,
  FindingExecutionRequestRow,
  useFindingExecutionSection,
} from './FindingExecutionSection';
import { LinkEvidenceModal } from './LinkEvidenceModal';
import { LinkTaskModal } from './LinkTaskModal';
import { FitBadge, SectionDivider } from './detail-primitives';
import { useFindingDetailController } from './useFindingDetailController';

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
  const executionController = useFindingExecutionSection(finding);

  return (
    <>
      <div className="flex h-full flex-col" data-testid="finding-detail-panel">
        <DetailPanelSectionNav sections={DETAIL_SECTIONS} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          {/* Summary */}
          <div data-anchor="summary" className="flex flex-col gap-1">
            <PanelTitleBlock title={finding.title} className="px-0" />
            <PanelSectionTitle>요약</PanelSectionTitle>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{finding.summary}</p>
          </div>

          <SectionDivider />

          {/* Metadata grid — Source Type / Severity / Confidence / Status */}
          <div data-anchor="metadata" className="flex flex-col gap-2">
            <PanelSectionTitle>소스 / 심각도 / 신뢰도</PanelSectionTitle>
            <FieldRow label="소스 유형" inset="none">
              <FitBadge>{FINDING_SOURCE_TYPE_LABELS[finding.source_type]}</FitBadge>
            </FieldRow>
            <FieldRow label="심각도" inset="none">
              <SeverityBadge severity={finding.severity as SeverityEnum} />
            </FieldRow>
            <FieldRow label="신뢰도" inset="none">
              {finding.confidence !== null ? (
                FINDING_CONFIDENCE_LABELS[finding.confidence]
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="상태" inset="none">
              <FitBadge>{FINDING_STATUS_LABELS[finding.status]}</FitBadge>
            </FieldRow>
            <FieldRow label="생성자" inset="none">
              <UserChip
                user={{
                  display_name: actorsById.get(finding.created_by) ?? GLOSSARY.unknownUser,
                }}
                size="sm"
              />
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Evidence Highlights — per design/05 layout: after Summary/Source/Severity/Confidence */}
          <div data-anchor="evidence" className="flex flex-col gap-3">
            <PanelSectionTitle>
              {GLOSSARY.evidenceHighlight} ({finding.evidence_count})
            </PanelSectionTitle>
            <EvidenceHighlightsSection
              findingId={finding.id}
              evidenceCount={finding.evidence_count}
            />
          </div>

          <SectionDivider />

          {/* Primary Managed System */}
          <div data-anchor="managed-system" className="flex flex-col gap-2">
            <PanelSectionTitle>주요 Managed System</PanelSectionTitle>
            <FieldRow label="Managed System" inset="none">
              <ManagedSystemPill
                name={managedSystemsById.get(finding.primary_managed_system_id) ?? 'Managed System'}
              />
            </FieldRow>
          </div>

          {/* Affected Analytics Area */}
          <div data-anchor="analytics-area" className="flex flex-col gap-2">
            <PanelSectionTitle>영향 Analytics Area</PanelSectionTitle>
            <FieldRow label="Analytics Area" inset="none">
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
            <PanelSectionTitle>연결된 VOC / Task</PanelSectionTitle>
            <FieldRow label={GLOSSARY.linkedVoc} inset="none">
              {finding.source_type === 'voc' && finding.source_id !== null ? (
                <Link
                  to="/vocs"
                  search={{ view: 'inbox', selected: finding.source_id }}
                  className="inline-flex items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                >
                  <span>{linkedVocTitle ?? GLOSSARY.linkedVoc}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedVocDisplayId ?? shortId(finding.source_id)}
                  </span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label={GLOSSARY.linkedTask} inset="none">
              {finding.linked_task_id !== null ? (
                <Link
                  to="/tasks"
                  search={{ view: 'backlog', param: finding.linked_task_id }}
                  className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                >
                  <span>{linkedTaskQuery.data?.title ?? GLOSSARY.linkedTask}</span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
                    {linkedTaskQuery.data?.display_id ?? shortId(finding.linked_task_id)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">이동</span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FindingExecutionRequestRow controller={executionController} />
          </div>
          <FindingExecutionRequestDraftSlot finding={finding} controller={executionController} />

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
                <FitBadge>{FINDING_STATUS_LABELS[status]}</FitBadge>
              )}
            />
          </div>
        </div>

        {/* CTA Footer */}
        <div className="sticky bottom-0 shrink-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-col gap-2">
          <FindingExecutionRequestActions controller={executionController} canManage={canManage} />
          <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
            <legend className="sr-only">보조 작업</legend>
            {executionController.pendingTaskRequest && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => executionController.setRequestTaskOpen(true)}
                disabled={!canManage}
                data-testid="request-task-btn"
              >
                Task 요청
              </Button>
            )}
            {/* Add Evidence — gated to finding.manage; backend authoritative */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddEvidenceOpen(true)}
              disabled={!canManage}
              data-testid="add-evidence-btn"
            >
              {GLOSSARY.addEvidence}
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
          </fieldset>
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
      <LinkTaskModal finding={finding} open={linkTaskOpen} onClose={() => setLinkTaskOpen(false)} />
    </>
  );
}
