// useCommittedSearchDraft — local draft that commits onto an external value.
//
// Moved out of useInboxRoute (#821 debounce, #864 immediate commit). `committed`
// is the value already written (the inbox passes the URL `q`). `write` runs at
// most once per distinct draft; `base` is what that write moves away from.
//
// pendingWriteRef:
//   idle → pending (base live) → pending (superseded) → acknowledged
//   idle                  undefined
//   pending (base live)   { draft, base }            commitDraft sets both
//   pending (superseded)  { draft, base: undefined } committed was neither;
//                                                    skipped once base is
//                                                    already undefined
//   acknowledged          undefined                  committed === draft
//
// draftAheadOfRef holds the pending draft while the box is ahead of it, so the
// acknowledgement does not copy `committed` over newer text. setDraft sets it
// when a write is pending and the value is neither that draft nor `committed`,
// or equals the live base (a cleared base no longer counts by itself). It is
// cleared on commit and on acknowledgement, except when `committed` equals the
// flagged draft: then it stays set so a StrictMode replay still refuses.

import { searchDebounceMs } from '@/lib/forms/search-debounce';
import * as React from 'react';

export interface UseCommittedSearchDraftOptions {
  committed: string;
  write: (draft: string, base: string) => void;
}

export function useCommittedSearchDraft({ committed, write }: UseCommittedSearchDraftOptions): {
  draft: string;
  setDraft: (value: string) => void;
  commit: () => void;
} {
  const [draft, setDraftState] = React.useState(committed);
  // #864: id of the pending debounced write, so an Enter/blur commit can cancel
  // it and the same draft is never written twice.
  const searchDebounceRef = React.useRef<number | undefined>(undefined);
  const pendingWriteRef = React.useRef<{ draft: string; base: string | undefined } | undefined>(
    undefined,
  );
  const draftAheadOfRef = React.useRef<string | undefined>(undefined);

  const commitDraft = React.useCallback(
    (next: string) => {
      const pending = pendingWriteRef.current;
      const base = pending !== undefined ? pending.draft : committed;
      // Already written (pending or acknowledged) — do not write it again.
      if (next === base) return;
      pendingWriteRef.current = { draft: next, base };
      draftAheadOfRef.current = undefined;
      write(next, base);
    },
    [committed, write],
  );

  function setDraft(value: string): void {
    const pending = pendingWriteRef.current;
    // #891: moving back to the pending write's base (Escape to '', or typing
    // the previous query again) is ahead of that write, like any newer draft.
    const returnedToPendingBase = pending !== undefined && value === pending.base;
    if (
      pending !== undefined &&
      value !== pending.draft &&
      (value !== committed || returnedToPendingBase)
    ) {
      draftAheadOfRef.current = pending.draft;
    } else {
      draftAheadOfRef.current = undefined;
    }
    setDraftState(value);
  }

  React.useEffect(() => {
    const pending = pendingWriteRef.current;
    if (pending !== undefined && committed === pending.draft) {
      pendingWriteRef.current = undefined;
    } else if (pending !== undefined && pending.base !== undefined && committed !== pending.base) {
      // #891: this outside URL is neither the pending write nor its base, so
      // that write has been superseded. Drop the base; a later return to it
      // must not be treated as ahead of the old write.
      pendingWriteRef.current = { draft: pending.draft, base: undefined };
    }
    // Strict mode runs this effect twice. The ref stays set so the second run
    // still refuses to replace a draft typed ahead of this acknowledgement.
    if (draftAheadOfRef.current !== undefined && committed === draftAheadOfRef.current) {
      return;
    }
    draftAheadOfRef.current = undefined;
    if (pending !== undefined && pending.draft !== committed) {
      setDraftState((current) => (current === pending.draft ? current : committed));
      return;
    }
    setDraftState(committed);
  }, [committed]);

  React.useEffect(() => {
    if (draft === committed) return;
    // #875: a paused half-typed syllable (로그이 on the way to 로그인) looks
    // like a finished one, and browsers do not report IME composition
    // reliably, so any Hangul-final draft waits longer.
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = undefined;
      commitDraft(draft);
    }, searchDebounceMs(draft));
    return () => {
      if (searchDebounceRef.current !== undefined) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = undefined;
      }
    };
    // `commitDraft` changes with `write`, so a new `write` identity restarts
    // the timer.
  }, [draft, committed, commitDraft]);

  // #864: Enter/blur commit — `write` the current draft at once and
  // cancel any pending debounced write of the same value.
  function commit(): void {
    if (searchDebounceRef.current !== undefined) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = undefined;
    }
    commitDraft(draft);
  }

  return { draft, setDraft, commit };
}
