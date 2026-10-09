// useTriageQueue.ts — local reducer for the triage screen queue.
//
// State lives inside the route (component-local) because the queue is
// route-scoped. No global store needed.
//
// Exported symbols:
//   - TriageQueueState, TriageQueueAction — types for the reducer
//   - triageQueueReducer — pure reducer (export for unit-tests)
//   - initialTriageQueueState — stable initial value
//   - useTriageQueue — hook wiring useReducer + derived liveQueue

import type { VocListItem } from '@fops/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

// ── State shape ───────────────────────────────────────────────────────────────

export interface TriagePriorValues {
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
}

export interface TriageQueueState {
  /** VOC ids that have been optimistically removed from the live queue. */
  optimisticallyRemoved: Set<string>;
  /** The most recently removed item — used for the undo flow. */
  lastRemoved: {
    vocId: string;
    priorValues: TriagePriorValues;
  } | null;
}

export const initialTriageQueueState: TriageQueueState = {
  optimisticallyRemoved: new Set(),
  lastRemoved: null,
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type TriageQueueAction =
  | {
      type: 'optimistic_remove';
      vocId: string;
      priorValues: TriagePriorValues;
    }
  | {
      type: 'optimistic_restore';
      vocId: string;
    }
  | {
      type: 'clear_last_removed';
    }
  | {
      type: 'expire_exclusions';
      vocIds: string[];
    };

// ── Reducer ───────────────────────────────────────────────────────────────────

export function triageQueueReducer(
  state: TriageQueueState,
  action: TriageQueueAction,
): TriageQueueState {
  switch (action.type) {
    case 'optimistic_remove': {
      const next = new Set(state.optimisticallyRemoved);
      next.add(action.vocId);
      return {
        optimisticallyRemoved: next,
        lastRemoved: { vocId: action.vocId, priorValues: action.priorValues },
      };
    }

    case 'optimistic_restore': {
      const next = new Set(state.optimisticallyRemoved);
      next.delete(action.vocId);
      return {
        optimisticallyRemoved: next,
        // Only clear lastRemoved if it matches the restored id
        lastRemoved: state.lastRemoved?.vocId === action.vocId ? null : state.lastRemoved,
      };
    }

    case 'expire_exclusions': {
      const next = new Set(state.optimisticallyRemoved);
      for (const vocId of action.vocIds) next.delete(vocId);
      return { ...state, optimisticallyRemoved: next };
    }

    case 'clear_last_removed':
      return { ...state, lastRemoved: null };

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseTriageQueueResult {
  state: TriageQueueState;
  dispatch: React.Dispatch<TriageQueueAction>;
  /** Server items filtered by optimisticallyRemoved. */
  liveQueue: VocListItem[];
  /** Optimistically remove a voc and set lastRemoved for undo. */
  optimisticRemove: (vocId: string, priorValues: TriagePriorValues) => void;
  /** Restore a previously removed voc (undo path). */
  optimisticRestore: (vocId: string) => void;
  optimisticPostpone: (vocId: string) => void;
}

export function useTriageQueue(
  serverItems: VocListItem[],
  contextKey = '',
  serverSettled = false,
): UseTriageQueueResult {
  const [state, dispatch] = useReducer(triageQueueReducer, initialTriageQueueState);

  const [postponedOverrides, setPostponedOverrides] = useState<Map<string, string | null>>(
    () => new Map(),
  );

  const postponedInSession = useRef(new Set<string>());

  // Retire local markers once a settled server read acknowledges the state.
  useEffect(() => {
    if (!serverSettled) return;
    setPostponedOverrides((current) => {
      const acknowledged = serverItems.filter(
        (voc) =>
          current.has(voc.id) &&
          (current.get(voc.id) === null) === (voc.review_postponed_at === null),
      );
      if (acknowledged.length === 0) return current;
      const next = new Map(current);
      for (const voc of acknowledged) next.delete(voc.id);
      return next;
    });
  }, [serverItems, serverSettled]);

  const [exclusionContext, setExclusionContext] = useState(contextKey);
  // Adjust before committing children so old exclusions never hide a new context's rows.
  // Expiring exclusions preserves lastRemoved and the original-id undo/error path.
  if (exclusionContext !== contextKey) {
    setExclusionContext(contextKey);
    dispatch({ type: 'expire_exclusions', vocIds: [...state.optimisticallyRemoved] });
  } else if (serverSettled) {
    const serverIds = new Set(serverItems.map((voc) => voc.id));
    const absentIds = [...state.optimisticallyRemoved].filter((id) => !serverIds.has(id));
    if (absentIds.length > 0) dispatch({ type: 'expire_exclusions', vocIds: absentIds });
  }

  const liveQueue = useMemo(
    () =>
      serverItems
        .filter((v) => !state.optimisticallyRemoved.has(v.id))
        .map((v) =>
          postponedOverrides.has(v.id)
            ? { ...v, review_postponed_at: postponedOverrides.get(v.id) ?? null }
            : v,
        ),
    [serverItems, state.optimisticallyRemoved, postponedOverrides],
  );

  function optimisticRemove(vocId: string, priorValues: TriagePriorValues): void {
    postponedInSession.current.delete(vocId);
    dispatch({ type: 'optimistic_remove', vocId, priorValues });
  }

  function optimisticRestore(vocId: string): void {
    dispatch({ type: 'optimistic_restore', vocId });
    const wasPostponed = postponedInSession.current.delete(vocId);
    setPostponedOverrides((current) => {
      if (!wasPostponed && !current.has(vocId)) return current;
      return new Map(current).set(vocId, null);
    });
  }

  function optimisticPostpone(vocId: string): void {
    postponedInSession.current.add(vocId);
    setPostponedOverrides((current) => new Map(current).set(vocId, new Date().toISOString()));
  }

  return { state, dispatch, liveQueue, optimisticRemove, optimisticRestore, optimisticPostpone };
}
