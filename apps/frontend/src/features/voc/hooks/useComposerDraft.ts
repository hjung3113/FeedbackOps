// useComposerDraft — per-(vocId, surface) draft state with reducer.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-470
//
// Switching vocId clears all 3 surfaces automatically via a ref comparison on
// the first render with the new id. Surfaces are independent; setDraft('public', …)
// never touches 'reply' or 'internal'.

import { useReducer, useRef, useCallback } from 'react';

export type ComposerSurface = 'public' | 'reply' | 'internal';

interface DraftState {
  public: string;
  reply: string;
  internal: string;
}

type DraftAction =
  | { type: 'SET'; surface: ComposerSurface; value: string }
  | { type: 'CLEAR'; surface: ComposerSurface }
  | { type: 'CLEAR_ALL' };

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.surface]: action.value };
    case 'CLEAR':
      return { ...state, [action.surface]: '' };
    case 'CLEAR_ALL':
      return { public: '', reply: '', internal: '' };
    default:
      return state;
  }
}

const INITIAL_STATE: DraftState = { public: '', reply: '', internal: '' };

export interface ComposerDraftHandle {
  getDraft: (surface: ComposerSurface) => string;
  setDraft: (surface: ComposerSurface, value: string) => void;
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
    (surface: ComposerSurface): string => state[surface],
    [state],
  );

  const setDraft = useCallback(
    (surface: ComposerSurface, value: string) => {
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
