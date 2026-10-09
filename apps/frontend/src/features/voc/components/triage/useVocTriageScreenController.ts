import type { FindingSeverity, VocListItem } from '@fops/shared';
import { useEffect, useRef, useState } from 'react';
import { type TriageQueueOutcome, useTriageQueue } from '../../hooks/useTriageQueue';
import type { TriageInput } from '../../lib/triage-types';

export interface VocTriageScreenControllerArgs {
  items: VocListItem[];
  selectedId: string | null;
  queueContext: string;
  queueSettled: boolean;
  activeTab: string;
  onAdvanceVoc: (id: string | null) => void;
  onRestoreVoc?: (id: string) => void;
}

export interface VocTriageScreenController {
  liveQueue: VocListItem[];
  selectedVoc: VocListItem | null;
  deepLinkTargetMissing: boolean;
  createFindingTarget: {
    vocId: string;
    managedSystemId: string;
    analyticsAreaId: string | null;
    defaultTitle: string;
    defaultSeverity: FindingSeverity;
  } | null;
  handleAct: (
    kind: 'confirm' | 'finding' | 'skip',
    context?: {
      vocId: string;
      managedSystemId: string;
      analyticsAreaId: string | null;
      title: string;
      severity: FindingSeverity;
    },
  ) => void;
  handleOptimisticRemove: (vocId: string, input?: TriageInput) => void;
  handleOptimisticPostpone: (vocId: string, input?: TriageInput) => void;
  handleOptimisticRestore: (vocId: string, input?: TriageInput) => void;
  handleQueueOutcome: (input: TriageInput, outcome: TriageQueueOutcome) => void;
  handleOptimisticRollback: (vocId: string, input?: TriageInput) => void;
  closeCreateFinding: () => void;
}

export function useVocTriageScreenController({
  items,
  selectedId,
  queueContext,
  queueSettled,
  activeTab,
  onAdvanceVoc,
  onRestoreVoc,
}: VocTriageScreenControllerArgs): VocTriageScreenController {
  const { liveQueue, optimisticRemove, optimisticRestore, optimisticPostpone, commandEnded } =
    useTriageQueue(items, queueContext, queueSettled);
  const [createFindingTarget, setCreateFindingTarget] = useState<{
    vocId: string;
    managedSystemId: string;
    analyticsAreaId: string | null;
    defaultTitle: string;
    defaultSeverity: FindingSeverity;
  } | null>(null);

  // Keep session history in a ref because a refetch removes the item from both
  // `items` and the live queue before selection can determine whether it was
  // previously present.
  const everInQueueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const voc of items) everInQueueRef.current.add(voc.id);
  }, [items]);

  const removedSelectionRef = useRef<{ vocId: string; nextId: string | null } | null>(null);
  const commandAdvances = useRef(
    new WeakMap<TriageInput, { id: string | null; context: string }>(),
  );
  const commandOwners = useRef(new Map<string, TriageInput>());
  useEffect(() => {
    return () => {
      // Compensation survives the screen, but its selection/focus eligibility does not.
      commandAdvances.current = new WeakMap();
      commandOwners.current.clear();
    };
  }, []);
  // The acting panel may unmount when it empties the queue; its undo callback
  // still needs the screen's current selection and navigation handler.
  const restoreSelection = useRef({ selectedId, queueContext, onRestoreVoc });
  restoreSelection.current = { selectedId, queueContext, onRestoreVoc };
  const selectedInQueue = liveQueue.find((voc) => voc.id === selectedId) ?? null;
  // Preserve the distinction between a previously queued selection, which may
  // auto-advance after removal, and a missing deep link, which must not fall
  // back to a different VOC.
  const deepLinkTargetMissing =
    selectedId !== null &&
    selectedInQueue === null &&
    !items.some((voc) => voc.id === selectedId) &&
    !everInQueueRef.current.has(selectedId);
  const actionFallback =
    removedSelectionRef.current?.vocId === selectedId
      ? (liveQueue.find((voc) => voc.id === removedSelectionRef.current?.nextId) ?? null)
      : (liveQueue[0] ?? null);
  const selectedVoc = deepLinkTargetMissing ? null : (selectedInQueue ?? actionFallback);

  function handleAct(
    kind: 'confirm' | 'finding' | 'skip',
    context?: {
      vocId: string;
      managedSystemId: string;
      analyticsAreaId: string | null;
      title: string;
      severity: FindingSeverity;
    },
  ): void {
    if (kind === 'finding' && context) {
      setCreateFindingTarget({
        vocId: context.vocId,
        managedSystemId: context.managedSystemId,
        analyticsAreaId: context.analyticsAreaId,
        defaultTitle: context.title,
        defaultSeverity: context.severity,
      });
    }
  }

  function advance(vocId: string, removing: boolean, input?: TriageInput): void {
    const index = liveQueue.findIndex((voc) => voc.id === vocId);
    const next = liveQueue[index + 1] ?? liveQueue.find((voc) => voc.id !== vocId);
    if (removing) removedSelectionRef.current = { vocId, nextId: next?.id ?? null };
    // A singleton mark keeps its row and selection; removal clears the pin.
    if (input) {
      const previous = commandOwners.current.get(vocId);
      if (previous) commandAdvances.current.delete(previous);
      commandOwners.current.set(vocId, input);
      if (next || removing) {
        commandAdvances.current.set(input, { id: next?.id ?? null, context: queueContext });
      }
    }
    if (next || removing) onAdvanceVoc(next?.id ?? null);
  }

  function handleOptimisticRemove(vocId: string, input?: TriageInput): void {
    const item = items.find((voc) => voc.id === vocId);
    if (!item) return;
    advance(vocId, true, input);
    optimisticRemove(
      vocId,
      {
        severity: item.severity,
        ownerUserId: item.owner_user_id,
        ownerTeamId: item.owner_team_id,
        analyticsAreaId: item.analytics_area_id,
      },
      input,
    );
  }

  function handleOptimisticPostpone(vocId: string, input?: TriageInput): void {
    if (activeTab === 'untriaged') {
      handleOptimisticRemove(vocId, input);
      return;
    }
    optimisticPostpone(vocId, input);
    advance(vocId, false, input);
  }

  return {
    liveQueue,
    selectedVoc,
    deepLinkTargetMissing,
    createFindingTarget,
    handleAct,
    handleOptimisticRemove,
    handleOptimisticPostpone,
    handleQueueOutcome: (input, outcome) => {
      commandAdvances.current.delete(input);
      if (commandOwners.current.get(input.vocId) === input) {
        commandOwners.current.delete(input.vocId);
      }
      commandEnded(input, outcome);
    },
    handleOptimisticRollback: (vocId, input) => {
      if (input) {
        commandAdvances.current.delete(input);
        if (commandOwners.current.get(vocId) === input) commandOwners.current.delete(vocId);
      }
      optimisticRestore(vocId, 'rollback', input);
    },
    // Undo reselects only while selection still matches this command's advance.
    // A forward failure reselects the failed VOC through onMutationFailure instead.
    handleOptimisticRestore: (vocId, input) => {
      optimisticRestore(vocId, undefined, input);
      const advanceTarget = input ? commandAdvances.current.get(input) : undefined;
      if (input) commandAdvances.current.delete(input);
      const current = restoreSelection.current;
      if (
        advanceTarget?.context === current.queueContext &&
        current.selectedId === advanceTarget.id
      ) {
        current.onRestoreVoc?.(vocId);
      }
    },
    closeCreateFinding: () => setCreateFindingTarget(null),
  };
}
