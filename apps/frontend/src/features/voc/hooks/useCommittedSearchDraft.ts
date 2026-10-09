// useCommittedSearchDraft — local draft that commits onto an external value.
//
// Moved out of useInboxRoute (#821 debounce, #864 immediate commit). `committed`
// is the value already written (the inbox passes the URL `q`). `write` runs at
// most once per distinct draft; `base` is what that write moves away from.

import * as React from 'react';

// #875: a draft whose last character is Hangul may still be a half-typed
// syllable in progress. The ranges cover Jamo (U+1100–U+11FF, U+3130–U+318F,
// e.g. ㄹ) and assembled syllables (U+AC00–U+D7A3, e.g. 이).
function endsWithHangul(draft: string): boolean {
  if (draft === '') return false;
  const code = draft.charCodeAt(draft.length - 1);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xac00 && code <= 0xd7a3)
  );
}

export interface UseCommittedSearchDraftOptions {
  committed: string;
  write: (draft: string, base: string) => void;
  debounceMs: number;
  /**
   * #875: debounce to use while the draft ends in a Hangul character (the IME
   * may still be composing that syllable).
   */
  hangulDebounceMs: number;
}

export function useCommittedSearchDraft({
  committed,
  write,
  debounceMs,
  hangulDebounceMs,
}: UseCommittedSearchDraftOptions): {
  draft: string;
  setDraft: (value: string) => void;
  commit: () => void;
} {
  const [draft, setDraftState] = React.useState(committed);
  // #864: id of the pending debounced write, so an Enter/blur commit can cancel
  // it and the same draft is never written twice.
  const searchDebounceRef = React.useRef<number | undefined>(undefined);
  // The last draft passed to `write` and not yet acknowledged by `committed`. A
  // repeat of that draft is skipped, and start/restore uses it instead of the
  // stale `committed`.
  const pendingCommitRef = React.useRef<string | undefined>(undefined);
  // The value that pending write moved away from. Until `committed` catches
  // up, that base is still the URL, so a draft equal to it is easy to miss.
  const pendingBaseRef = React.useRef<string | undefined>(undefined);
  // When the box moves past `pendingCommitRef`, this holds that pending draft
  // so the acknowledgement must not copy the URL back over the newer text.
  const draftAheadOfRef = React.useRef<string | undefined>(undefined);

  const commitDraft = React.useCallback(
    (next: string) => {
      const base = pendingCommitRef.current !== undefined ? pendingCommitRef.current : committed;
      // Already written (pending or acknowledged) — do not write it again.
      if (next === base) return;
      pendingCommitRef.current = next;
      pendingBaseRef.current = base;
      draftAheadOfRef.current = undefined;
      write(next, base);
    },
    [committed, write],
  );

  function setDraft(value: string): void {
    const pending = pendingCommitRef.current;
    // #891: moving back to the pending write's base (Escape to '', or typing
    // the previous query again) is ahead of that write, like any newer draft.
    const returnedToPendingBase = value === pendingBaseRef.current;
    if (
      pending !== undefined &&
      value !== pending &&
      (value !== committed || returnedToPendingBase)
    ) {
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
      pendingBaseRef.current = undefined;
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
    // #875: a paused half-typed syllable (로그이 on the way to 로그인) looks
    // like a finished one, and browsers do not report IME composition
    // reliably, so any Hangul-final draft waits longer.
    searchDebounceRef.current = window.setTimeout(
      () => {
        searchDebounceRef.current = undefined;
        commitDraft(draft);
      },
      endsWithHangul(draft) ? hangulDebounceMs : debounceMs,
    );
    return () => {
      if (searchDebounceRef.current !== undefined) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = undefined;
      }
    };
    // `commitDraft` changes with `write`, so a new `write` identity restarts
    // the timer.
  }, [draft, committed, commitDraft, debounceMs, hangulDebounceMs]);

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
