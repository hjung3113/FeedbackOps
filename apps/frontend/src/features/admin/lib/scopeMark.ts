// scopeMark — admin registry mark derivation.
// ADR-0057 B6 supersedes #87's hashed palette; the shared UI helper resolves
// known slugs to identity tokens and unknown slugs to the neutral fallback.

import { managedSystemMarkColor } from '@fops/ui';

/** Stable swatch for a slug. */
export function scopeMarkColor(slug: string): string {
  return managedSystemMarkColor(slug);
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
