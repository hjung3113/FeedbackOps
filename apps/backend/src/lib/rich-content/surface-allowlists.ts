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
  // Tightened for Slice 3 #16 per spec §5.7 table.
  // public-update: no links, no attachments, no mentions, no images.
  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    marks: new Set(['bold', 'italic']),
    allowedLinkSchemes: new Set<string>(),
    maxTextBytes: 50 * 1024,
  },
  // reporter-reply: attachmentRef node allowed (value layer rejects non-empty
  // attachments[] until storage slice ships); link mark allowed http/https.
  'reporter-reply': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
  // internal-comment: full feature set — codeBlock, mention, attachmentRef,
  // bold, italic, code, link.
  'internal-comment': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'codeBlock',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
};
