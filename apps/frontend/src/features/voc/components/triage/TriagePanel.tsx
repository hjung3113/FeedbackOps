/**
 * TriagePanel — full read+pick pass (Chunk 2) + mutation wire-up (C3.2).
 *
 * Prototype ref: screen-voc-create.jsx:393-587
 * Renders the right-column detail panel in the WorkbenchShell triage view.
 *
 * C3.2: wires useUndoableMutation into TriageActions for optimistic mutation,
 * 4-sec undo, abort/compensate, and full error matrix.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.5):
 *   .panel-scroll → pt-7 pr-6 pb-8 pl-6 overflow-y-auto flex-1
 *   .panel-section → mb-8 (last child mb-0)
 *   .panel-footer handled by TriageActions component
 */

import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { type VocListItem, isTipTapDocStructurallyEmpty } from '@fops/shared';
import {
  AnalyticsAreaPicker,
  Button,
  DetailPanelSectionNav,
  PanelSectionTitle,
  PanelTitleBlock,
  type PickerOption,
  ReporterStatusBadge,
  RichContentRenderer,
  type TipTapDoc,
  UndoToast,
} from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import { Maximize2, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { useTriageCommand } from '../../hooks/useTriageCommand';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';
import type { CallToken } from '../../hooks/useUndoableMutation';
import type { TriageInput } from '../../lib/triage-types';
import { ClusterSectionReadOnly } from './ClusterSectionReadOnly';
import { type OwnerCandidate, OwnerPicker } from './OwnerPicker';
import { type SeverityLevel, SeverityPicker } from './SeverityPicker';
import { TriageActions } from './TriageActions';
import { TriageSummaryCard } from './TriageSummaryCard';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TriagePanelProps {
  voc: VocListItem;
  /**
   * Called when a triage action is triggered. For non-mutation side-effects.
   */
  onAct?: (
    kind: 'confirm' | 'finding' | 'skip',
    /** vocId/managedSystemId/analyticsAreaId as just committed — only populated for 'confirm' and 'finding'. */
    context?: { vocId: string; managedSystemId: string; analyticsAreaId: string | null },
  ) => void;
  /**
   * C3.2: Optimistic remove — called synchronously on confirm/finding/skip
   * so the queue filters this VOC out immediately.
   */
  onOptimisticRemove?: (vocId: string) => void;
  /**
   * C3.2: Optimistic restore — called on error to re-insert the VOC into
   * the queue (stale_write, rate_limited, permission.denied paths).
   */
  onOptimisticRestore?: (vocId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ADR-0051 groups the prototype's seven sections into four; Similar remains conditional on count.
function buildTriageSections(similarCount: number) {
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'assignment', label: 'Assignment' },
    ...(similarCount > 0 ? [{ id: 'similar', label: 'Similar', count: similarCount }] : []),
    { id: 'summary', label: 'Summary' },
  ];
}

export function TriagePanel({
  voc,
  onAct,
  onOptimisticRemove,
  onOptimisticRestore,
}: TriagePanelProps): React.ReactElement {
  const { panelState, baseline, dispatch, dirty } = useTriagePanelState(voc);
  const { actors } = useWorkspaceActors();
  const vocDetailQuery = useVocDetail(voc.id);
  // Ref for the scrollable body — used by DetailPanelSectionNav to observe anchors
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Build owner candidates from workspace actors list
  const candidates: OwnerCandidate[] = React.useMemo(() => {
    if (!actors) return [];
    return actors.map((a) => ({
      id: a.id,
      display_name: a.display_name,
      // Actor list has no teams (ADR-0018); OwnerPicker still wants kind.
      kind: 'user' as const,
    }));
  }, [actors]);

  // Build actor map for TriageSummaryCard display
  const actorMap = React.useMemo(() => {
    const map = new Map<string, { display_name: string }>();
    for (const c of candidates) {
      map.set(c.id, { display_name: c.display_name });
    }
    return map;
  }, [candidates]);

  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', voc.primary_managed_system_id, 'triage'] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: voc.primary_managed_system_id,
        includeArchived: true,
        signal,
      }),
  });
  const aaOptions: PickerOption[] = React.useMemo(
    () =>
      (analyticsAreasQuery.data?.items ?? [])
        .filter(
          (area) =>
            area.managed_system_id === voc.primary_managed_system_id &&
            (area.archived_at === null || area.id === voc.analytics_area_id),
        )
        .map((area) => ({
          id: area.id,
          label: area.archived_at === null ? area.name : `${area.name} (보관됨)`,
          archived: area.archived_at !== null,
        })),
    [analyticsAreasQuery.data?.items, voc.analytics_area_id, voc.primary_managed_system_id],
  );

  const currentOwnerId = panelState.ownerUserId ?? panelState.ownerTeamId;
  const baselineAreaName = aaOptions.find((area) => area.id === baseline.analyticsAreaId)?.label;
  const stagedAreaName = aaOptions.find((area) => area.id === panelState.analyticsAreaId)?.label;

  // ── mutation setup ──────────────────────────────────────────────────────────

  // Undo state machine — HTTP adapter, compensation order, and the error
  // matrix live in useTriageCommand (issue #481). The panel keeps panel state,
  // input assembly, and the toast UI.
  const { panelLocked, isSubmitting, commit, undoLast } = useTriageCommand({
    voc,
    onOptimisticRestore,
  });

  // Keep a stable ref to undoLast so the toast closure always sees the latest version.
  // (The closure in toast.custom captures undoLast at call time; the ref stays current.)
  // REV-3 Cluster X: undoLast accepts an optional CallToken so toasts can bind
  // their undo action to the specific call that produced them.
  const undoLastRef = React.useRef<(token?: CallToken) => void>(() => {
    /* no-op until mounted */
  });

  // Keep the ref current
  undoLastRef.current = undoLast;

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleConfirmOrFinding = React.useCallback(
    (kind: 'confirm' | 'finding') => {
      if (panelLocked) return;
      const input: TriageInput = {
        kind,
        vocId: voc.id,
        ifMatch: voc.updated_at,
        severity: panelState.severity,
        ownerUserId: panelState.ownerUserId,
        ownerTeamId: panelState.ownerTeamId,
        analyticsAreaId: panelState.analyticsAreaId,
      };

      // Optimistic remove synchronously
      onOptimisticRemove?.(voc.id);

      // Fire the undoable mutation — error surfaces via mutationState+lastError.
      // REV-3 Cluster X: capture the per-call token so the toast we issue
      // below binds its undo to THIS call only. Once a follow-up mutate
      // replaces the current call, this toast becomes inert.
      const callToken: CallToken = commit(input);

      // Show UndoToast via sonner's toast.custom
      // Prototype ref: screen-voc-create.jsx:699-730 → UndoToast positioning
      const message =
        kind === 'finding' ? `${voc.display_id} Finding 만들기` : `${voc.display_id} Triage 확정됨`;

      toast.custom(
        (toastId) => (
          <UndoToast
            message={message}
            onAction={() => {
              // REV-3 Cluster X: pass the token so undoLast no-ops if this is
              // a stale toast (a newer mutation has since started).
              undoLastRef.current(callToken);
              toast.dismiss(toastId);
            }}
            onDismiss={() => {
              toast.dismiss(toastId);
            }}
            duration={4000}
          />
        ),
        { duration: 4000 },
      );

      onAct?.(kind, {
        vocId: voc.id,
        managedSystemId: voc.primary_managed_system_id,
        analyticsAreaId: panelState.analyticsAreaId,
      });
    },
    [
      panelLocked,
      voc.id,
      voc.display_id,
      voc.updated_at,
      voc.primary_managed_system_id,
      panelState,
      onOptimisticRemove,
      onAct,
      commit,
    ],
  );

  const handleSkip = React.useCallback(() => {
    if (panelLocked) return;
    const input: TriageInput = {
      kind: 'skip',
      vocId: voc.id,
      ifMatch: voc.updated_at,
    };

    // Optimistic remove
    onOptimisticRemove?.(voc.id);

    // REV-3 Cluster X: capture per-call token and bind the toast's undo to it.
    const callToken: CallToken = commit(input);

    const message = `${voc.display_id} 보류 처리됨`;
    toast.custom(
      (toastId) => (
        <UndoToast
          message={message}
          onAction={() => {
            undoLastRef.current(callToken);
            toast.dismiss(toastId);
          }}
          onDismiss={() => {
            toast.dismiss(toastId);
          }}
          duration={4000}
        />
      ),
      { duration: 4000 },
    );

    onAct?.('skip');
  }, [panelLocked, voc.id, voc.display_id, voc.updated_at, onOptimisticRemove, onAct, commit]);

  // ── render ─────────────────────────────────────────────────────────────────

  const triageSections = buildTriageSections(voc.similar_count);

  return (
    <div className="flex flex-col h-full bg-surface-detail border-l border-border-subtle overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between h-[50px] px-5 border-b border-border-subtle shrink-0">
        <span className="font-mono text-xs text-text-muted tabular-nums">{voc.display_id}</span>
        {/* Expand + more ghost icon buttons (prototype L423-426). No behavior
            yet — rendered disabled to preserve the prototype affordance.
            Follow-up: wire panel fullscreen + overflow menu (deferred). */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled
            aria-label="패널 확장"
            data-testid="triage-panel-expand"
            className="h-7 w-7 p-0"
          >
            <Maximize2 size={14} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled
            aria-label="더 보기"
            data-testid="triage-panel-more"
            className="h-7 w-7 p-0"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Section nav — grouped per ADR-0051; no shared nav behavior changes. */}
      <DetailPanelSectionNav sections={triageSections} scrollRef={scrollRef} />

      {/* Scrollable body — V1b document rhythm (no dividers, typographic-only hierarchy) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-7 pr-6 pb-8 pl-6">
        {/* ADR-0051 intentionally groups the real description into Overview. */}
        <div className="mb-8" data-anchor="overview">
          <PanelTitleBlock title={voc.title} className="!px-0 !py-0 mb-2" />
          <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
            <ReporterStatusBadge status={voc.reporter_facing_status} />
            <span aria-hidden="true">·</span>
            <span>{new Date(voc.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
          <div data-testid="triage-description-region">
            {vocDetailQuery.isLoading && !vocDetailQuery.data ? (
              <p className="text-xs text-text-muted">불러오는 중…</p>
            ) : vocDetailQuery.data && 'description_rich_content' in vocDetailQuery.data ? (
              isTipTapDocStructurallyEmpty(vocDetailQuery.data.description_rich_content) ? (
                <p className="text-sm text-text-muted">본문 없음</p>
              ) : (
                <div className="text-sm text-text-secondary leading-relaxed">
                  <RichContentRenderer
                    doc={vocDetailQuery.data.description_rich_content as TipTapDoc}
                    mode="internal"
                  />
                </div>
              )
            ) : vocDetailQuery.data ? (
              <div className="rounded-md border border-dashed border-border-subtle p-3 text-sm text-text-muted">
                본문을 표시할 수 없습니다 — 이 VOC의 상세 내용을 볼 권한이 없습니다.
              </div>
            ) : vocDetailQuery.isError ? (
              <div className="rounded-md border border-dashed border-border-subtle p-3 text-sm text-text-muted">
                본문을 불러오지 못했습니다.
              </div>
            ) : (
              <p className="text-xs text-text-muted">불러오는 중…</p>
            )}
          </div>
        </div>

        <div className="mb-8" data-anchor="assignment">
          <div className="mb-6">
            <PanelSectionTitle>Severity 결정</PanelSectionTitle>
            <SeverityPicker
              value={(panelState.severity as SeverityLevel) ?? null}
              onChange={(sev) => {
                dispatch({ type: 'set_severity', severity: sev });
              }}
              disabled={panelLocked || isSubmitting}
            />
          </div>

          <div className="mb-6">
            <PanelSectionTitle>Owner 배정 (선택)</PanelSectionTitle>
            <OwnerPicker
              candidates={candidates}
              value={currentOwnerId}
              onChange={({ ownerUserId, ownerTeamId }) => {
                dispatch({ type: 'set_owner', ownerUserId, ownerTeamId });
              }}
            />
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              미지정 상태로 확정할 수 있으며 Owner는 나중에 지정할 수 있습니다.
            </p>
          </div>

          <div>
            <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
            {analyticsAreasQuery.isLoading ? (
              <p className="text-xs text-text-muted">Analytics Area를 불러오는 중입니다.</p>
            ) : analyticsAreasQuery.isError ? (
              <p className="text-xs text-feedback-error">Analytics Area를 불러오지 못했습니다.</p>
            ) : aaOptions.length === 0 ? (
              <p className="text-xs text-text-muted">
                이 Managed System에 선택할 수 있는 Analytics Area가 없습니다.
              </p>
            ) : (
              <AnalyticsAreaPicker
                options={aaOptions}
                value={panelState.analyticsAreaId}
                onChange={(id) => {
                  dispatch({ type: 'set_analytics_area', analyticsAreaId: id });
                }}
                placeholder="Analytics Area 선택"
                testId="triage-aa-picker"
              />
            )}
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
            </p>
          </div>
        </div>

        {/* Similar is the same recommendation content, grouped under a clearer nav label. */}
        <ClusterSectionReadOnly vocId={voc.id} similarCount={voc.similar_count} />

        {/* Compact changed-fields summary */}
        <div className="mb-0" data-anchor="summary">
          <PanelSectionTitle>Summary · 변경 사항</PanelSectionTitle>
          <TriageSummaryCard
            panelState={panelState}
            baseline={baseline}
            actorMap={actorMap}
            baselineAnalyticsAreaName={baselineAreaName}
            analyticsAreaName={stagedAreaName}
            currentReporterStatus={voc.reporter_facing_status}
          />
        </div>
      </div>

      {/* Panel footer */}
      <TriageActions
        dirty={dirty && !panelLocked}
        submitting={isSubmitting}
        onConfirm={() => {
          handleConfirmOrFinding('confirm');
        }}
        onFinding={() => {
          handleConfirmOrFinding('finding');
        }}
        onSkip={handleSkip}
      />
    </div>
  );
}

TriagePanel.displayName = 'TriagePanel';
