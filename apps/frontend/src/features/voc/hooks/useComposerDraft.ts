// useComposerDraft — per-(vocId, surface) draft state with reducer.
//
// C5.1 (slice3 #21)
// REV-1 #7: stores TipTapDoc | null per surface so drafts survive tab switches.
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-470
//
// Switching vocId clears all 3 surfaces automatically via a ref comparison on
// the first render with the new id. Surfaces are independent; setDraft('public', …)
// never touches 'reply' or 'internal'.

import { useReducer, useRef, useCallback } from 'react';
import type { TipTapDoc } from '@fops/ui';

export type ComposerSurface = 'public' | 'reply' | 'internal';

// REV-1 #7: draft values are TipTapDoc | null (not string) so rich content is preserved.
interface DraftState {
  public: TipTapDoc | null;
  reply: TipTapDoc | null;
  internal: TipTapDoc | null;
}

type DraftAction =
  | { type: 'SET'; surface: ComposerSurface; value: TipTapDoc | null }
  | { type: 'CLEAR'; surface: ComposerSurface }
  | { type: 'CLEAR_ALL' };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.surface]: action.value };
    case 'CLEAR':
      return { ...state, [action.surface]: null };
    case 'CLEAR_ALL':
      return { public: null, reply: null, internal: null };
    default:
      return state;
  }
}

const INITIAL_STATE: DraftState = { public: null, reply: null, internal: null };

export interface ComposerDraftHandle {
  getDraft: (surface: ComposerSurface) => TipTapDoc | null;
  setDraft: (surface: ComposerSurface, value: TipTapDoc | null) => void;
  clearDraft: (surface: ComposerSurface) => void;
  clearAll: () => void;
  state: DraftState;
}

/**
 * Keyed by vocId. When vocId changes the state is reset to the initial state
 * synchronously in the current render via a ref comparison.
 */
export function useComposerDraft(vocId: string): ComposerDraftHandle {
  const prevVocIdRef = useRef<string>(vocId);
  const pendingClearRef = useRef(false);

  if (prevVocIdRef.current !== vocId) {
    prevVocIdRef.current = vocId;
    pendingClearRef.current = true;
  }

  const [state, dispatch] = useReducer(
    draftReducer,
    undefined,
    () => INITIAL_STATE,
  );

  // If vocId changed, trigger a CLEAR_ALL synchronously during render.
  // Using a ref + immediate dispatch is the safe React pattern for derived state resets.
  if (pendingClearRef.current) {
    pendingClearRef.current = false;
    dispatch({ type: 'CLEAR_ALL' });
  }

  const getDraft = useCallback(
    (surface: ComposerSurface): TipTapDoc | null => state[surface],
    [state],
  );

  const setDraft = useCallback(
    (surface: ComposerSurface, value: TipTapDoc | null) => {
      dispatch({ type: 'SET', surface, value });
    },
    [],
  );

  const clearDraft = useCallback((surface: ComposerSurface) => {
    dispatch({ type: 'CLEAR', surface });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  return {
    getDraft,
    setDraft,
    clearDraft,
    clearAll,
    state,
  };
}
