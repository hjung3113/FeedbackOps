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

import { ApiError, apiClient } from '@/lib/api';
import type { VocListItem } from '@fops/shared';
import {
  AnalyticsAreaPicker,
  Button,
  DetailPanelSectionNav,
  PanelSectionTitle,
  PanelTitleBlock,
  type PickerOption,
  ReporterStatusBadge,
  UndoToast,
  cn,
} from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Maximize2, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';
import { type CallToken, useUndoableMutation } from '../../hooks/useUndoableMutation';
import {
  type TriageInput,
  type TriageOutput,
  type TriageSnapshot,
  executeCompensatingPatch,
} from '../../hooks/useVocTriageMutation';
import { useWorkspaceActors } from '../../hooks/useWorkspaceActors';
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

// Prototype ref (screen-voc-create.jsx:411-418): section IDs for the triage panel.
// Owner and Cluster sections are always shown; Cluster count badge reflects similarCount.
function buildTriageSections(similarCount: number) {
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'body', label: 'Body' },
    { id: 'severity', label: 'Severity' },
    { id: 'owner', label: 'Owner' },
    { id: 'area', label: 'Area' },
    ...(similarCount > 0 ? [{ id: 'cluster', label: 'Cluster', count: similarCount }] : []),
    { id: 'summary', label: 'Summary' },
  ];
}

export function TriagePanel({
  voc,
  onAct,
  onOptimisticRemove,
  onOptimisticRestore,
}: TriagePanelProps): React.ReactElement {
  const { panelState, dispatch, dirty } = useTriagePanelState(voc);
  const { actors } = useWorkspaceActors();
  const queryClient = useQueryClient();
  // Ref for the scrollable body — used by DetailPanelSectionNav to observe anchors
  const scrollRef = React.useRef<HTMLDivElement>(null);

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
  // REV-3 Cluster X: undoLast accepts an optional CallToken so toasts can bind
  // their undo action to the specific call that produced them.
  const undoLastRef = React.useRef<(token?: CallToken) => void>(() => {
    /* no-op until mounted */
  });

  // Stable ref so the hook callbacks always see the latest restore handler.
  // We deliberately do NOT keep a ref to voc.id here: VocTriageScreen
  // auto-advances the selected VOC after optimistic remove, so a vocIdRef would
  // point at the NEXT row by the time onError/onAbort fires (REV-1 #5). All
  // queue side-effects must close over the original mutation input instead.
  const onOptimisticRestoreRef = React.useRef(onOptimisticRestore);
  onOptimisticRestoreRef.current = onOptimisticRestore;

  const {
    mutate: undoableMutate,
    undoLast,
    state: mutationState,
  } = useUndoableMutation<TriageInput, TriageOutput, TriageSnapshot>({
    mutationFn: async (input: TriageInput, signal?: AbortSignal): Promise<TriageOutput> => {
      const res = await apiClient<TriageOutput>('PATCH', `/vocs/${input.vocId}`, {
        body: buildPayload(input),
        ifMatch: input.ifMatch,
        ...(signal !== undefined && { signal }),
      });
      return res.data;
    },
    snapshot: (input: TriageInput): TriageSnapshot => {
      // REV-1 #3: snapshot from the PRIOR voc values (what compensate must
      // restore the VOC to), NOT from staged panelState (the new values the
      // user just chose). If we snapshot staged values, the compensating
      // PATCH writes the new values back with triage_state='untriaged' and
      // permanently mutates severity/owner/AA.
      const isConfirm = input.kind === 'confirm' || input.kind === 'finding';
      return {
        vocId: input.vocId,
        ifMatch: input.ifMatch,
        severity: isConfirm ? voc.severity : null,
        ownerUserId: isConfirm ? voc.owner_user_id : null,
        ownerTeamId: isConfirm ? voc.owner_team_id : null,
        analyticsAreaId: isConfirm ? voc.analytics_area_id : null,
        wasConfirm: isConfirm,
      };
    },
    compensateFn: async (snapshot: TriageSnapshot, output: TriageOutput | null) => {
      // REV-1 #4: use the FRESH updated_at from the first PATCH response as
      // the If-Match for the compensating PATCH. The original snapshot.ifMatch
      // (voc.updated_at at confirm time) is stale once the first PATCH commits
      // — reusing it self-fails with conflict.stale_write.
      //
      // REV-3 Cluster Y: `apiClient` returns `undefined` for an empty 200
      // body. The prior guard checked `output !== null` and then dereferenced
      // `output.updated_at`, which threw for `undefined`. When fresh
      // `updated_at` is absent from the PATCH response, refetch
      // ['voc', vocId] and pull the fresh `updated_at` off the refreshed
      // envelope instead of falling back to the stale snapshot baseline.
      let freshUpdatedAt: string | undefined =
        output != null && typeof (output as { updated_at?: unknown }).updated_at === 'string'
          ? (output as { updated_at: string }).updated_at
          : undefined;

      if (freshUpdatedAt === undefined) {
        try {
          // Use refetchQueries with type:'all' so we refetch even when there's
          // no active observer (the detail panel may not be mounted while the
          // triage queue panel runs the undo). If the query has never been
          // populated, fall back to fetchQuery.
          await queryClient.refetchQueries({
            queryKey: ['voc', snapshot.vocId],
            type: 'all',
          });
          let fresh = queryClient.getQueryData<{ updated_at?: unknown }>(['voc', snapshot.vocId]);
          if (!fresh) {
            fresh = await queryClient.fetchQuery<{ updated_at?: unknown }>({
              queryKey: ['voc', snapshot.vocId],
              queryFn: async ({ signal }) => {
                const res = await apiClient<{ updated_at?: unknown }>(
                  'GET',
                  `/vocs/${snapshot.vocId}`,
                  { signal },
                );
                return res.data;
              },
            });
          }
          if (fresh && typeof fresh.updated_at === 'string') {
            freshUpdatedAt = fresh.updated_at;
          }
        } catch (refetchErr) {
          // REV-4 P1: Refetch itself failed (network, etc.). Do NOT fall through
          // to executeCompensatingPatch with a stale If-Match — that's a
          // guaranteed 409 and provides no value to the user. Surface an error
          // toast so the user knows compensation failed, and throw so undoLast's
          // .catch handler can reset the hook state cleanly.
          toast.error('VOC를 새로 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
          // Tag so onCompensateError can skip double-toasting.
          const tagged = Object.assign(
            refetchErr instanceof Error ? refetchErr : new Error(String(refetchErr)),
            { __refetchFailure: true as const },
          );
          throw tagged;
        }
      }

      const freshSnapshot: TriageSnapshot =
        freshUpdatedAt !== undefined ? { ...snapshot, ifMatch: freshUpdatedAt } : snapshot;
      await executeCompensatingPatch(freshSnapshot);
      // Re-insert into queue after successful compensate
      onOptimisticRestoreRef.current?.(snapshot.vocId);
    },
    // REV-1 #1: when the user undoes while the PATCH is still in-flight,
    // useUndoableMutation aborts the controller and fires onAbort with the
    // original input. Restore the row to the queue using that input — never
    // current props, which may already point at the auto-advanced VOC.
    onAbort: (input: TriageInput) => {
      onOptimisticRestoreRef.current?.(input.vocId);
    },
    // REV-4: surface a toast when compensateFn rejects. Two paths land here:
    //   a) Refetch failure — the catch block above already toasted and tagged
    //      the error with __refetchFailure; skip toasting again here.
    //   b) Compensating PATCH failure (e.g. 409) — toast the generic undo error.
    onCompensateError: (err: unknown) => {
      if (err !== null && typeof err === 'object' && '__refetchFailure' in err) {
        // Already toasted by the refetch catch block.
        return;
      }
      toast.error('실행 취소 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    },
    // Error matrix (PLAN-21 §302-307): handle via onError so we get the actual error object.
    // REV-1 #5: use the original input.vocId (closure on the failing mutate call),
    // never vocIdRef.current — VocTriageScreen auto-advances the selected VOC after
    // optimistic remove, so vocIdRef.current points at the NEXT row, not the failed one.
    onError: (err: unknown, input: TriageInput) => {
      const vocId = input.vocId;
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: voc.id is the reset trigger for switching panels.
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

      // Fire the undoable mutation — error surfaces via mutationState+lastError.
      // REV-3 Cluster X: capture the per-call token so the toast we issue
      // below binds its undo to THIS call only. Once a follow-up mutate
      // replaces the current call, this toast becomes inert.
      const callToken: CallToken = undoableMutate(input);

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

    // REV-3 Cluster X: capture per-call token and bind the toast's undo to it.
    const callToken: CallToken = undoableMutate(input);

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

      {/* Section nav — sticky anchor tabs (prototype: screen-voc-create.jsx:428) */}
      <DetailPanelSectionNav sections={triageSections} scrollRef={scrollRef} />

      {/* Scrollable body — V1b document rhythm (no dividers, typographic-only hierarchy) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-7 pr-6 pb-8 pl-6">
        {/* Overview / title block — mirrors prototype .panel-title:
            lg title + status pill + meta row (date only; no reporter actor
            available on VocListItem). Mirrors the read-only detail panel
            IdentitySection for cross-surface consistency. */}
        <div className="mb-7" data-anchor="overview">
          <PanelTitleBlock title={voc.title} className="!px-0 !py-0 mb-2" />
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <ReporterStatusBadge status={voc.reporter_facing_status} />
            <span aria-hidden="true">·</span>
            <span>{new Date(voc.created_at).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        {/* Body — BODY label + tinted card per reference image.
            DATA-BLOCKED (#90): prototype L441 renders {voc.description}, but the
            triage list payload (VocListItem) carries only `title`, not
            `description`. Wiring the body to description requires adding it to the
            list-item read schema (or a per-VOC detail fetch) — deferred; rendering
            the available title until the description field is sourced. */}
        <div className="mb-8" data-anchor="body">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">BODY</p>
          <div
            data-testid="triage-body-card"
            className="rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary leading-relaxed"
          >
            {voc.title}
          </div>
        </div>

        {/* Severity section */}
        <div className={cn('mb-8')} data-anchor="severity">
          <PanelSectionTitle>Severity 결정</PanelSectionTitle>
          <SeverityPicker
            value={(panelState.severity as SeverityLevel) ?? null}
            onChange={(sev) => {
              dispatch({ type: 'set_severity', severity: sev });
            }}
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
            onChange={(id) => {
              dispatch({ type: 'set_analytics_area', analyticsAreaId: id });
            }}
            placeholder="Analytics Area 선택"
            testId="triage-aa-picker"
          />
          <p className="text-xs text-text-muted mt-2 leading-relaxed">
            Analytics Area는 권한 경계가 아닙니다. 분류·기본값 용도로만 사용됩니다.
          </p>
        </div>

        {/* Cluster section */}
        <ClusterSectionReadOnly vocId={voc.id} similarCount={voc.similar_count} />

        {/* Triage 결과 미리보기 */}
        <div className="mb-0" data-anchor="summary">
          <PanelSectionTitle>Triage 결과 미리보기</PanelSectionTitle>
          <TriageSummaryCard
            panelState={panelState}
            actorMap={actorMap}
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
