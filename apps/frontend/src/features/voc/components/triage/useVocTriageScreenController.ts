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
  onSelectVoc: (id: string) => void;
}

export interface VocTriageScreenController {
  liveQueue: VocListItem[];
  processedCount: number;
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
  handleProcessed: (delta: 1 | -1) => void;
  closeCreateFinding: () => void;
}

export function useVocTriageScreenController({
  items,
  selectedId,
  queueContext,
  queueSettled,
  activeTab,
  onSelectVoc,
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

  const [processedCount, setProcessedCount] = useState(0);

  function handleProcessed(delta: 1 | -1): void {
    setProcessedCount((count) => count + delta);
  }

  // Keep session history in a ref because a refetch removes the item from both
  // `items` and the live queue before selection can determine whether it was
  // previously present.
  const everInQueueRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const voc of items) everInQueueRef.current.add(voc.id);
  }, [items]);

  const selectedInQueue = liveQueue.find((voc) => voc.id === selectedId) ?? null;
  // Preserve the distinction between a previously queued selection, which may
  // auto-advance after removal, and a missing deep link, which must not fall
  // back to a different VOC.
  const deepLinkTargetMissing =
    selectedId !== null &&
    selectedInQueue === null &&
    !items.some((voc) => voc.id === selectedId) &&
    !everInQueueRef.current.has(selectedId);
  const selectedVoc = deepLinkTargetMissing ? null : (selectedInQueue ?? liveQueue[0] ?? null);

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

  function handleOptimisticRemove(vocId: string, input?: TriageInput): void {
    const item = items.find((voc) => voc.id === vocId);
    if (!item) return;
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
    const index = liveQueue.findIndex((voc) => voc.id === vocId);
    const next = liveQueue[index + 1] ?? liveQueue.find((voc) => voc.id !== vocId);
    if (next) onSelectVoc(next.id);
  }

  return {
    liveQueue,
    processedCount,
    selectedVoc,
    deepLinkTargetMissing,
    createFindingTarget,
    handleAct,
    handleOptimisticRemove,
    handleOptimisticPostpone,
    handleQueueOutcome: commandEnded,
    handleOptimisticRollback: (vocId, input) => {
      optimisticRestore(vocId, 'rollback', input);
    },
    // Undo and compensation keep the current selection (as before #940); a forward
    // failure reselects the failed VOC through onMutationFailure instead.
    handleOptimisticRestore: (vocId, input) => {
      optimisticRestore(vocId, undefined, input);
    },
    handleProcessed,
    closeCreateFinding: () => setCreateFindingTarget(null),
  };
}
