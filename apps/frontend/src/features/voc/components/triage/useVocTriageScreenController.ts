import type { FindingSeverity, VocListItem } from '@fops/shared';
import { useEffect, useRef, useState } from 'react';
import { useTriageQueue } from '../../hooks/useTriageQueue';

export interface VocTriageScreenControllerArgs {
  items: VocListItem[];
  selectedId: string | null;
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
  handleOptimisticRemove: (vocId: string) => void;
  handleOptimisticRestore: (vocId: string) => void;
  closeCreateFinding: () => void;
}

export function useVocTriageScreenController({
  items,
  selectedId,
}: VocTriageScreenControllerArgs): VocTriageScreenController {
  const {
    state: queueState,
    liveQueue,
    optimisticRemove,
    optimisticRestore,
  } = useTriageQueue(items);
  const [createFindingTarget, setCreateFindingTarget] = useState<{
    vocId: string;
    managedSystemId: string;
    analyticsAreaId: string | null;
    defaultTitle: string;
    defaultSeverity: FindingSeverity;
  } | null>(null);

  const processedCount = queueState.optimisticallyRemoved.size;
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

  function handleOptimisticRemove(vocId: string): void {
    const item = items.find((voc) => voc.id === vocId);
    if (!item) return;
    optimisticRemove(vocId, {
      severity: item.severity,
      ownerUserId: item.owner_user_id,
      ownerTeamId: item.owner_team_id,
      analyticsAreaId: item.analytics_area_id,
    });
  }

  return {
    liveQueue,
    processedCount,
    selectedVoc,
    deepLinkTargetMissing,
    createFindingTarget,
    handleAct,
    handleOptimisticRemove,
    handleOptimisticRestore: optimisticRestore,
    closeCreateFinding: () => setCreateFindingTarget(null),
  };
}
