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
import { useMemo, useReducer, useState } from 'react';

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
}

export function useTriageQueue(
  serverItems: VocListItem[],
  contextKey = '',
  serverSettled = false,
): UseTriageQueueResult {
  const [state, dispatch] = useReducer(triageQueueReducer, initialTriageQueueState);

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
    () => serverItems.filter((v) => !state.optimisticallyRemoved.has(v.id)),
    [serverItems, state.optimisticallyRemoved],
  );

  function optimisticRemove(vocId: string, priorValues: TriagePriorValues): void {
    dispatch({ type: 'optimistic_remove', vocId, priorValues });
  }

  function optimisticRestore(vocId: string): void {
    dispatch({ type: 'optimistic_restore', vocId });
  }

  return { state, dispatch, liveQueue, optimisticRemove, optimisticRestore };
}
