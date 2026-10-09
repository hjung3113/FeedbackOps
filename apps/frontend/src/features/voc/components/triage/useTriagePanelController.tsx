import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { FindingSeverity, VocListItem } from '@fops/shared';
import { type PickerOption, UndoToast } from '@fops/ui';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { useTriageCommand } from '../../hooks/useTriageCommand';
import { useTriagePanelState } from '../../hooks/useTriagePanelState';
import type { CallToken } from '../../hooks/useUndoableMutation';
import type { TriageInput } from '../../lib/triage-types';
import type { OwnerCandidate } from './OwnerPicker';

export function useTriagePanelController({
  voc,
  onAct,
  onOptimisticRemove,
  onProcessed,
  onOptimisticRestore,
}: {
  voc: VocListItem;
  onAct?: (
    kind: 'confirm' | 'finding' | 'skip',
    context?: {
      vocId: string;
      managedSystemId: string;
      analyticsAreaId: string | null;
      title: string;
      severity: FindingSeverity;
    },
  ) => void;
  onOptimisticRemove?: (vocId: string) => void;
  onProcessed?: (delta: 1 | -1) => void;
  onOptimisticRestore?: (vocId: string) => void;
}) {
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
  // matrix live in useTriageCommand (issue #481). The controller keeps panel state,
  // input assembly, and the toast UI.
  const { panelLocked, isSubmitting, commit, undoLast } = useTriageCommand({
    voc,
    onProcessed,
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
      const callToken: CallToken = commit(input, () => {
        toast.dismiss(successToastId);
      });

      // Show UndoToast via sonner's toast.custom
      // Prototype ref: screen-voc-create.jsx:699-730 → UndoToast positioning
      const message =
        kind === 'finding' ? `${voc.display_id} Finding 만들기` : `${voc.display_id} Triage 확정됨`;

      const successToastId = toast.custom(
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
        title: voc.title,
        severity: (panelState.severity ?? voc.severity ?? 'medium') as FindingSeverity,
      });
    },
    [
      panelLocked,
      voc.id,
      voc.display_id,
      voc.updated_at,
      voc.primary_managed_system_id,
      voc.title,
      voc.severity,
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
    const callToken: CallToken = commit(input, () => {
      toast.dismiss(successToastId);
    });

    const message = `${voc.display_id} 보류 처리됨`;
    const successToastId = toast.custom(
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

  return {
    panelState,
    baseline,
    dispatch,
    dirty,
    vocDetailQuery,
    scrollRef,
    candidates,
    actorMap,
    analyticsAreasQuery,
    aaOptions,
    currentOwnerId,
    baselineAreaName,
    stagedAreaName,
    panelLocked,
    isSubmitting,
    handleConfirmOrFinding,
    handleSkip,
  };
}
