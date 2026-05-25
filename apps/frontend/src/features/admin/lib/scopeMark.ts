// scopeMark — deterministic colored-square identity for a Managed System.
//
// Prototype-silent deviation (issue #87 locked decision #1): the prototype's
// `data.js` hands each Managed System a hand-authored `color` + `mark`. The
// real API (core.managed_systems) carries no color/mark column. We derive both
// deterministically so the registry stays visually stable across reloads
// without a schema change:
//   - color: hashed from the immutable slug into a fixed palette.
//   - mark:  initials from the display name (1-2 chars, uppercased).
// This is the ONE place hex color is allowed in the admin screen path
// (apps/frontend/AGENTS.md → Design Consistency: scope-mark palette helper).

// Fixed palette — saturated, legible against white text. Order is stable; the
// hash picks an index so a given slug always lands on the same swatch.
const SCOPE_MARK_PALETTE = [
  '#5e6ad2', // indigo
  '#e5793b', // orange
  '#0f9d8e', // teal
  '#3aa655', // green
  '#c0497b', // magenta
  '#4b8fd6', // blue
  '#9a6dd7', // violet
  '#d4a017', // amber
] as const;

/** FNV-1a 32-bit hash — small, fast, deterministic; no crypto needed. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable swatch for a slug. */
export function scopeMarkColor(slug: string): string {
  const idx = hashString(slug) % SCOPE_MARK_PALETTE.length;
  // SCOPE_MARK_PALETTE is a non-empty const tuple; idx is always in range.
  return SCOPE_MARK_PALETTE[idx] as string;
}

/**
 * Initials for the square. Takes the first character of up to the first two
 * whitespace-separated words; falls back to the first two chars of a single
 * word. Latin output is uppercased; non-Latin (e.g. Hangul) is passed through.
 */
export function scopeMarkLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  const raw =
    words.length >= 2 && words[0] && words[1]
      ? `${words[0][0]}${words[1][0]}`
      : trimmed.slice(0, 2);
  return raw.toUpperCase();
}

export interface ScopeMark {
  color: string;
  label: string;
}

/** Combined derivation for a Managed System row. */
export function scopeMark(slug: string, name: string): ScopeMark {
  return { color: scopeMarkColor(slug), label: scopeMarkLabel(name) };
}
