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

import * as React from 'react';
import { toast } from 'sonner';
import type { VocListItem } from '@fops/shared';
import {
  PanelSectionTitle,
  PanelTitleBlock,
  NestedTextBlock,
  ReporterStatusBadge,
  AnalyticsAreaPicker,
  UndoToast,
  type PickerOption,
  cn,
} from '@fops/ui';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';
import { useWorkspaceActors } from '../../hooks/useWorkspaceActors';
import { useUndoableMutation } from '../../hooks/useUndoableMutation';
import {
  executeCompensatingPatch,
  type TriageInput,
  type TriageSnapshot,
} from '../../hooks/useVocTriageMutation';
import { apiClient, ApiError } from '@/lib/api';
import { SeverityPicker, type SeverityLevel } from './SeverityPicker';
import { OwnerPicker, type OwnerCandidate } from './OwnerPicker';
import { TriageSummaryCard } from './TriageSummaryCard';
import { ClusterSectionReadOnly } from './ClusterSectionReadOnly';
import { TriageActions } from './TriageActions';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TriagePanelProps {
  voc: VocListItem;
  /**
   * Called when a triage action is triggered. For non-mutation side-effects.
   */
  onAct?: (kind: 'confirm' | 'finding' | 'skip') => void;
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

export function TriagePanel({
  voc,
  onAct,
  onOptimisticRemove,
  onOptimisticRestore,
}: TriagePanelProps): React.ReactElement {
  const { panelState, dispatch, dirty } = useTriagePanelState(voc);
  const { actors } = useWorkspaceActors();

  // Panel-level lock for idempotency_key_reuse (per spec §5.3 + PLAN-21 §307)
  const [panelLocked, setPanelLocked] = React.useState(false);

  // Build owner candidates from workspace actors list
  const candidates: OwnerCandidate[] = React.useMemo(() => {
    if (!actors) return [];
    return actors.map((a) => ({
      id: a.id,
      display_name: a.display_name,
      kind: a.kind,
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

  // Stub analytics area options
  const aaOptions: PickerOption[] = [];

  const currentOwnerId = panelState.ownerUserId ?? panelState.ownerTeamId;

  // ── mutation setup ──────────────────────────────────────────────────────────

  // Keep a stable ref to undoLast so the toast closure always sees the latest version.
  // (The closure in toast.custom captures undoLast at call time; the ref stays current.)
  const undoLastRef = React.useRef<() => void>(() => { /* no-op until mounted */ });

  // Stable refs so callbacks used inside useUndoableMutation always see current values
  const onOptimisticRestoreRef = React.useRef(onOptimisticRestore);
  onOptimisticRestoreRef.current = onOptimisticRestore;
  const vocIdRef = React.useRef(voc.id);
  vocIdRef.current = voc.id;

  const { mutate: undoableMutate, undoLast, state: mutationState } = useUndoableMutation<
    TriageInput,
    void,
    TriageSnapshot
  >({
    mutationFn: async (input: TriageInput, signal?: AbortSignal) => {
      await apiClient('PATCH', `/vocs/${input.vocId}`, {
        body: buildPayload(input),
        ifMatch: input.ifMatch,
        ...(signal !== undefined && { signal }),
      });
    },
    snapshot: (input: TriageInput): TriageSnapshot => {
      const isConfirm = input.kind === 'confirm' || input.kind === 'finding';
      return {
        vocId: input.vocId,
        ifMatch: input.ifMatch,
        severity: isConfirm ? (panelState.severity ?? null) : null,
        ownerUserId: isConfirm ? (panelState.ownerUserId ?? null) : null,
        ownerTeamId: isConfirm ? (panelState.ownerTeamId ?? null) : null,
        analyticsAreaId: isConfirm ? (panelState.analyticsAreaId ?? null) : null,
        wasConfirm: isConfirm,
      };
    },
    compensateFn: async (snapshot: TriageSnapshot) => {
      await executeCompensatingPatch(snapshot);
      // Re-insert into queue after successful compensate
      onOptimisticRestoreRef.current?.(snapshot.vocId);
    },
    // Error matrix (PLAN-21 §302-307): handle via onError so we get the actual error object
    onError: (err: unknown) => {
      const vocId = vocIdRef.current;
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'conflict.stale_write':
            onOptimisticRestoreRef.current?.(vocId);
            toast.warning('다른 사용자가 먼저 수정했습니다. 새로 불러왔습니다.');
            break;
          case 'conflict.record_archived':
          case 'conflict.parent_archived':
            // Permanent remove — no restore needed
            toast.error('이 항목은 보관되어 변경할 수 없습니다.');
            break;
          case 'permission.denied':
          case 'permission.scope_required':
            onOptimisticRestoreRef.current?.(vocId);
            toast.error('권한이 없습니다.');
            break;
          case 'rate_limited.actor':
            onOptimisticRestoreRef.current?.(vocId);
            toast.warning('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
            break;
          case 'conflict.idempotency_key_reuse':
            // Lock the panel — user must switch VOC to unlock
            setPanelLocked(true);
            toast.error('이미 처리된 요청입니다.');
            break;
          default:
            onOptimisticRestoreRef.current?.(vocId);
            toast.error('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } else {
        onOptimisticRestoreRef.current?.(vocId);
        toast.error('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
  });

  // Keep the ref current
  undoLastRef.current = undoLast;

  // Unlock panel when voc changes (per spec: lock until VOC switch)
  React.useEffect(() => {
    setPanelLocked(false);
  }, [voc.id]);

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

      // Fire the undoable mutation — error surfaces via mutationState+lastError
      undoableMutate(input);

      // Show UndoToast via sonner's toast.custom
      // Prototype ref: screen-voc-create.jsx:699-730 → UndoToast positioning
      const message =
        kind === 'finding'
          ? `${voc.display_id} Finding 만들기`
          : `${voc.display_id} Triage 확정됨`;

      toast.custom(
        (toastId) => (
          <UndoToast
            message={message}
            onAction={() => {
              // Always call via ref so we get the latest undoLast (handles state transition)
              undoLastRef.current();
              toast.dismiss(toastId);
            }}
            onDismiss={() => { toast.dismiss(toastId); }}
            duration={4000}
          />
        ),
        { duration: 4000 },
      );

      // D-3.4: Finding 만들기 — DO NOT navigate; toast the deferral message
      if (kind === 'finding') {
        toast.info('Finding 생성은 Slice 5에서 제공됩니다.', { duration: 3000 });
      }

      onAct?.(kind);
    },
    [
      panelLocked,
      voc.id,
      voc.display_id,
      voc.updated_at,
      panelState,
      onOptimisticRemove,
      onAct,
      undoableMutate,
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

    undoableMutate(input);

    const message = `${voc.display_id} 보류 처리됨`;
    toast.custom(
      (toastId) => (
        <UndoToast
          message={message}
          onAction={() => {
            undoLastRef.current();
            toast.dismiss(toastId);
          }}
          onDismiss={() => { toast.dismiss(toastId); }}
          duration={4000}
        />
      ),
      { duration: 4000 },
    );

    onAct?.('skip');
  }, [
    panelLocked,
    voc.id,
    voc.display_id,
    voc.updated_at,
    onOptimisticRemove,
    onAct,
    undoableMutate,
  ]);

  // ── render ─────────────────────────────────────────────────────────────────

  const isSubmitting = mutationState === 'pending';

  return (
    <div className="flex flex-col h-full bg-surface-detail border-l border-border-subtle overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between h-[50px] px-5 border-b border-border-subtle shrink-0">
        <span className="font-mono text-xs text-text-muted tabular-nums">{voc.display_id}</span>
        <div className="flex items-center gap-1" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto pt-7 pr-6 pb-8 pl-6">
        {/* Overview / title block */}
        <div className="mb-6">
          <PanelTitleBlock
            title={voc.title}
            badges={
              <>
                <ReporterStatusBadge status={voc.reporter_facing_status} />
                <span className="text-xs text-text-muted">
                  · {new Date(voc.created_at).toLocaleDateString('ko-KR')}
                </span>
              </>
            }
          />
        </div>

        {/* Description */}
        <div className="mb-8">
          <PanelSectionTitle>Body</PanelSectionTitle>
          <NestedTextBlock>
            <span className="text-sm text-text-secondary">{voc.title}</span>
          </NestedTextBlock>
        </div>

        {/* Severity section */}
        <div className={cn('mb-8')} data-anchor="severity">
          <PanelSectionTitle>Severity 결정</PanelSectionTitle>
          <SeverityPicker
            value={(panelState.severity as SeverityLevel) ?? null}
            onChange={(sev) => { dispatch({ type: 'set_severity', severity: sev }); }}
            disabled={panelLocked || isSubmitting}
          />
        </div>

        {/* Owner section */}
        <div className="mb-8" data-anchor="owner">
          <PanelSectionTitle>Owner 배정</PanelSectionTitle>
          <OwnerPicker
            candidates={candidates}
            value={currentOwnerId}
            onChange={({ ownerUserId, ownerTeamId }) => {
              dispatch({ type: 'set_owner', ownerUserId, ownerTeamId });
            }}
          />
        </div>

        {/* Analytics Area section */}
        <div className="mb-8" data-anchor="area">
          <PanelSectionTitle>Analytics Area 연결</PanelSectionTitle>
          <AnalyticsAreaPicker
            options={aaOptions}
            value={panelState.analyticsAreaId}
            onChange={(id) => { dispatch({ type: 'set_analytics_area', analyticsAreaId: id }); }}
            placeholder="Analytics Area 선택"
            testId="triage-aa-picker"
          />
          <p className="text-xs text-text-muted mt-2 leading-relaxed">
            Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
          </p>
        </div>

        {/* Cluster section */}
        <ClusterSectionReadOnly similarCount={voc.similar_count} />

        {/* Triage 결과 미리보기 */}
        <div className="mb-0" data-anchor="summary">
          <PanelSectionTitle>Triage 결과 미리보기</PanelSectionTitle>
          <TriageSummaryCard panelState={panelState} actorMap={actorMap} />
        </div>
      </div>

      {/* Panel footer */}
      <TriageActions
        dirty={dirty && !panelLocked}
        submitting={isSubmitting}
        onConfirm={() => { handleConfirmOrFinding('confirm'); }}
        onFinding={() => { handleConfirmOrFinding('finding'); }}
        onSkip={handleSkip}
      />
    </div>
  );
}

TriagePanel.displayName = 'TriagePanel';

// ── helpers ────────────────────────────────────────────────────────────────

function buildPayload(input: TriageInput): Record<string, unknown> {
  if (input.kind === 'skip') {
    return { postpone_review: true };
  }
  return {
    triage_state: 'triaged' as const,
    severity: input.severity,
    owner_user_id: input.ownerUserId,
    owner_team_id: input.ownerTeamId,
    analytics_area_id: input.analyticsAreaId,
  };
}
