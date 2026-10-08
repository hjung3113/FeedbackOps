// useCommittedSearchDraft — local draft that commits onto an external value.
//
// Moved out of useInboxRoute (#821 debounce, #864 immediate commit). `committed`
// is the value already written (the URL q). `write` runs at most once per
// distinct draft; `base` is what that write moves away from.

import * as React from 'react';

export interface UseCommittedSearchDraftOptions {
  committed: string;
  write: (draft: string, base: string) => void;
  debounceMs: number;
  /**
   * #875: debounce to use while an IME composition is active (a paused
   * half-typed syllable must not be searched). Omitted: the composing state
   * does not change the delay.
   */
  composingDebounceMs?: number;
}

export function useCommittedSearchDraft({
  committed,
  write,
  debounceMs,
  composingDebounceMs,
}: UseCommittedSearchDraftOptions): {
  draft: string;
  setDraft: (value: string) => void;
  commit: () => void;
  setComposing: (composing: boolean) => void;
} {
  const [draft, setDraftState] = React.useState(committed);
  // #875: an IME composition is active (SearchInput reports start/end). The
  // debounce effect picks the delay for the current state.
  const [composing, setComposingState] = React.useState(false);
  // #864: id of the pending debounced write, so an Enter/blur commit can cancel
  // it and the same draft is never written twice.
  const searchDebounceRef = React.useRef<number | undefined>(undefined);
  // The last draft written to the URL and not yet acknowledged by it. A repeat
  // of that draft is skipped, and start/restore uses it instead of the stale URL.
  const pendingCommitRef = React.useRef<string | undefined>(undefined);
  // When the box moves past `pendingCommitRef`, this holds that pending draft
  // so the acknowledgement must not copy the URL back over the newer text.
  const draftAheadOfRef = React.useRef<string | undefined>(undefined);

  const commitDraft = React.useCallback(
    (next: string) => {
      const base = pendingCommitRef.current !== undefined ? pendingCommitRef.current : committed;
      // Already written (pending or acknowledged) — do not write it again.
      if (next === base) return;
      pendingCommitRef.current = next;
      draftAheadOfRef.current = undefined;
      write(next, base);
    },
    [committed, write],
  );

  function setDraft(value: string): void {
    const pending = pendingCommitRef.current;
    if (pending !== undefined && value !== pending && value !== committed) {
      draftAheadOfRef.current = pending;
    } else {
      draftAheadOfRef.current = undefined;
    }
    setDraftState(value);
  }

  React.useEffect(() => {
    const pending = pendingCommitRef.current;
    if (pending !== undefined && committed === pending) {
      pendingCommitRef.current = undefined;
    }
    // Strict mode runs this effect twice. The ref stays set so the second run
    // still refuses to replace a draft typed ahead of this acknowledgement.
    if (draftAheadOfRef.current !== undefined && committed === draftAheadOfRef.current) {
      return;
    }
    draftAheadOfRef.current = undefined;
    if (pending !== undefined && pending !== committed) {
      setDraftState((current) => (current === pending ? current : committed));
      return;
    }
    setDraftState(committed);
  }, [committed]);

  React.useEffect(() => {
    if (draft === committed) return;
    // #875: `composing` is a dependency, so a composition start/end re-runs
    // this effect and restarts the pending timer with the new state's delay.
    searchDebounceRef.current = window.setTimeout(
      () => {
        searchDebounceRef.current = undefined;
        commitDraft(draft);
      },
      composing ? (composingDebounceMs ?? debounceMs) : debounceMs,
    );
    return () => {
      if (searchDebounceRef.current !== undefined) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = undefined;
      }
    };
    // `commitDraft` changes with `write`, so a new write identity (a tab change,
    // in the inbox) restarts the timer, as depending on `commitSearchDraft` did.
  }, [draft, committed, commitDraft, debounceMs, composingDebounceMs, composing]);

  // #864: Enter/blur commit — write the current draft to the URL at once and
  // cancel any pending debounced write of the same value.
  function commit(): void {
    if (searchDebounceRef.current !== undefined) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = undefined;
    }
    commitDraft(draft);
  }

  // #875: SearchInput reports IME composition start/end; the debounce effect
  // restarts with the delay for the new state.
  function setComposing(value: boolean): void {
    setComposingState(value);
  }

  return { draft, setDraft, commit, setComposing };
}
