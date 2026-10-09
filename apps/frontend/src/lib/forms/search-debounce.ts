// #821: keystrokes settle for this long before the search is sent.
export const SEARCH_DEBOUNCE_MS = 300;
// #875: a draft ending in a Hangul character may still be composing its last syllable.
export const SEARCH_HANGUL_DEBOUNCE_MS = 700;

// #875: a draft whose last character is Hangul may still be a half-typed
// syllable in progress. The ranges cover Jamo (U+1100–U+11FF, U+3130–U+318F,
// e.g. ㄹ) and assembled syllables (U+AC00–U+D7A3, e.g. 이).
export function endsWithHangul(draft: string): boolean {
  if (draft === '') return false;
  const code = draft.charCodeAt(draft.length - 1);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xac00 && code <= 0xd7a3)
  );
}

export function searchDebounceMs(draft: string): number {
  return endsWithHangul(draft) ? SEARCH_HANGUL_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS;
}
