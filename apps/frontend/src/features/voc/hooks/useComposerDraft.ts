// useComposerDraft — per-(vocId, surface) draft state with reducer.
//
// C5.1 (slice3 #21)
// REV-1 #7: stores TipTapDoc | null per surface so drafts survive tab switches.
// REV-2 #7: vocId is part of the reducer state. When the consumer passes a new
//   vocId, the hook returns a synchronous fresh state for THIS render — so
//   children consuming `state` directly see empty drafts immediately, not the
//   prior VOC's stale drafts. The stored reducer state catches up via a
//   self-dispatched RESET in the same pass.
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:400-470

import { useReducer, useCallback } from 'react';
import type { TipTapDoc } from '@fops/ui';

export type ComposerSurface = 'public' | 'reply' | 'internal';

// REV-1 #7: draft values are TipTapDoc | null (not string) so rich content is preserved.
interface DraftState {
  vocId: string;
  public: TipTapDoc | null;
  reply: TipTapDoc | null;
  internal: TipTapDoc | null;
}

type DraftAction =
  | { type: 'SET'; surface: ComposerSurface; value: TipTapDoc | null }
  | { type: 'CLEAR'; surface: ComposerSurface }
  | { type: 'CLEAR_ALL' }
  | { type: 'RESET_FOR_VOC'; vocId: string };

function makeInitial(vocId: string): DraftState {
  return { vocId, public: null, reply: null, internal: null };
}

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'SET':
      return { ...state, [action.surface]: action.value };
    case 'CLEAR':
      return { ...state, [action.surface]: null };
    case 'CLEAR_ALL':
      return { ...state, public: null, reply: null, internal: null };
    case 'RESET_FOR_VOC':
      // Idempotent — if the reducer has already absorbed the new vocId, no-op.
      if (state.vocId === action.vocId) return state;
      return makeInitial(action.vocId);
    default:
      return state;
  }
}

// Public surface for the hook — the same shape the original implementation
// returned (with `state` flattened to the three surfaces consumers expect).
export interface ComposerDraftHandle {
  getDraft: (surface: ComposerSurface) => TipTapDoc | null;
  setDraft: (surface: ComposerSurface, value: TipTapDoc | null) => void;
  clearDraft: (surface: ComposerSurface) => void;
  clearAll: () => void;
  state: { public: TipTapDoc | null; reply: TipTapDoc | null; internal: TipTapDoc | null };
}

/**
 * Keyed by vocId. When vocId changes the state seen by the current render is
 * reset synchronously — children consuming `state` directly observe empty
 * drafts on the same render, not on the next one (REV-2 #7).
 */
export function useComposerDraft(vocId: string): ComposerDraftHandle {
  const [stored, dispatch] = useReducer(draftReducer, vocId, makeInitial);

  // Synchronously derive the state visible to consumers on THIS render. If the
  // stored reducer state still references the prior vocId (CLEAR_ALL hasn't
  // landed yet), expose fresh empty drafts so children never see stale data
  // on the first render with a new vocId.
  const effective: DraftState = stored.vocId === vocId ? stored : makeInitial(vocId);
  if (stored.vocId !== vocId) {
    // Schedule the reducer catch-up. React de-duplicates by reference so this
    // doesn't loop — the next render reads stored.vocId === vocId and skips.
    dispatch({ type: 'RESET_FOR_VOC', vocId });
  }

  const getDraft = useCallback(
    (surface: ComposerSurface): TipTapDoc | null => effective[surface],
    [effective],
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
    state: { public: effective.public, reply: effective.reply, internal: effective.internal },
  };
}
