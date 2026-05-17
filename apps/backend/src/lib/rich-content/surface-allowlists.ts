// apps/backend/src/lib/rich-content/surface-allowlists.ts
// Per-surface node + mark allowlists. Spec: docs/frontend/specs/voc.md §5.7.
// Backend sanitizer is the authoritative gate (ADR-0011); the client toolbar
// is UX guidance only. Surfaces extend additively as later slices ship.

export const SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type Surface = (typeof SURFACES)[number];

export interface SurfaceAllowlist {
  nodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  // http(s) only — sanitizer rejects javascript:, data:, file:
  allowedLinkSchemes: ReadonlySet<string>;
  // hard cap on total text content (chars). Spec: 50 KB.
  maxTextBytes: number;
}

const HTTP_ONLY = new Set(['http:', 'https:']);

export const SURFACE_ALLOWLISTS: Readonly<Record<Surface, SurfaceAllowlist>> = {
  'voc-description': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'underline', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
  // Stubs for later slices — Slice 3 #13 only exercises voc-description.
  // Keep entries so #16 (composers) can extend additively rather than
  // restructuring this file.
  'reporter-reply': {
    nodes: new Set(['doc', 'paragraph', 'text']),
    marks: new Set(['bold', 'italic', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    marks: new Set(['bold', 'italic']),
    allowedLinkSchemes: new Set(),
    maxTextBytes: 50 * 1024,
  },
  'internal-comment': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
};
