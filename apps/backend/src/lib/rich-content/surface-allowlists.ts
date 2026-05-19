// apps/backend/src/lib/rich-content/surface-allowlists.ts
// Per-surface node + mark allowlists with per-attr value schemas.
// Spec: docs/frontend/specs/voc.md §5.7. ADR-0011 names this layer authoritative.
//
// Layering note: the sanitizer enforces attr *shape* here (type, format, length).
// Service-layer business rules (e.g. rejecting non-empty attachments[] until the
// storage slice ships) are enforced separately in conversation-service.ts. These
// two gates are intentionally distinct; do not collapse them.

export const SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type Surface = (typeof SURFACES)[number];

// ── AttrSchema ────────────────────────────────────────────────────────────────

export type AttrSchema =
  | { kind: 'uuid'; required: boolean }
  | { kind: 'url'; schemes: ReadonlySet<string>; maxLen: number; required: boolean }
  | { kind: 'string'; maxLen: number; nullable: boolean; required: boolean };

// ── SurfaceAllowlist ──────────────────────────────────────────────────────────

export interface SurfaceAllowlist {
  nodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  // nodeAttrs: node type → allowed attr key → value schema.
  // A node type NOT present here means attrs must be absent or empty {}.
  nodeAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  // markAttrs: mark type → allowed attr key → value schema.
  // A mark type NOT present here means attrs must be absent or empty {}.
  markAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  // Retained for back-compat reads in tests; sanitizer now uses link's AttrSchema.
  allowedLinkSchemes: ReadonlySet<string>;
  // hard cap on total text content (chars). Spec: 50 KB.
  maxTextBytes: number;
}

// ── Shared scheme sets ────────────────────────────────────────────────────────

const HTTP_ONLY = new Set(['http:', 'https:']);

// ── Shared attr schemas ───────────────────────────────────────────────────────

const uuidRequired: AttrSchema = { kind: 'uuid', required: true };

const attachmentRefAttrs: Readonly<Record<string, AttrSchema>> = {
  id: uuidRequired,
};

const linkMarkAttrs: Readonly<Record<string, AttrSchema>> = {
  href: { kind: 'url', schemes: HTTP_ONLY, maxLen: 2048, required: true },
};

// ── Surface definitions ───────────────────────────────────────────────────────

export const SURFACE_ALLOWLISTS: Readonly<Record<Surface, SurfaceAllowlist>> = {
  'voc-description': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    marks: new Set(['bold', 'italic', 'underline', 'code', 'link']),
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
    },
    markAttrs: {
      link: linkMarkAttrs,
    },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },

  // public-update: no links, no attachments, no mentions, no images.
  // No nodeAttrs or markAttrs entries: all attrs must be absent or empty.
  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    marks: new Set(['bold', 'italic']),
    nodeAttrs: {},
    markAttrs: {},
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
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
    },
    markAttrs: {
      link: linkMarkAttrs,
    },
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
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
      mention: {
        // Canonical attr name per conversation-service.ts:517 (codex major finding).
        actor_id: uuidRequired,
      },
      codeBlock: {
        language: { kind: 'string', maxLen: 32, nullable: true, required: false },
      },
    },
    markAttrs: {
      link: linkMarkAttrs,
    },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
  },
};
