// PLAN-22 C9 — shared per-surface rich-content allowlist.
//
// This module is the single source of truth for which TipTap nodes/marks/attrs
// each surface accepts. Both the backend authoritative sanitizer
// (apps/backend/src/lib/rich-content/sanitize.ts, ADR-0011) and the FE
// render-time defence-in-depth sanitizer (packages/ui/src/rich-content/
// sanitizeClient.ts) import these constants. A `drift-vs-shared` test on the
// backend asserts the two stay in lockstep.
//
// Values copied verbatim from the original backend file as of PLAN-22 C9
// extraction; the backend file now re-exports rather than re-defines.

// ── Surface enum ─────────────────────────────────────────────────────────────

export const SHARED_SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type SharedSurface = (typeof SHARED_SURFACES)[number];

// ── AttrSchema ───────────────────────────────────────────────────────────────

export type AttrSchema =
  | { kind: 'uuid'; required: boolean }
  | { kind: 'url'; schemes: ReadonlySet<string>; maxLen: number; required: boolean }
  | { kind: 'string'; maxLen: number; nullable: boolean; required: boolean };

// ── SurfaceAllowlist ─────────────────────────────────────────────────────────

// DoS caps — see surface-allowlists.ts header for rationale.
export interface SharedSurfaceAllowlist {
  nodes: ReadonlySet<string>;
  leafNodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  nodeAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  markAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  allowedLinkSchemes: ReadonlySet<string>;
  maxTextBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxMarks: number;
}

export type SharedAllowlists = Readonly<Record<SharedSurface, SharedSurfaceAllowlist>>;

// ── Surface extension capabilities ──────────────────────────────────────────

export const SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES = [
  'bold',
  'italic',
  'underline',
  'code',
  'list',
  'link',
  'mention',
  'attachmentRef',
] as const;

export type SharedRichContentExtensionCapability =
  (typeof SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES)[number];

export type SharedSurfaceExtensionCapabilities = Readonly<
  Record<SharedSurface, readonly SharedRichContentExtensionCapability[]>
>;

// ── Shared scheme sets ───────────────────────────────────────────────────────

const HTTP_ONLY = new Set(['http:', 'https:']);

// ── Shared attr schemas ──────────────────────────────────────────────────────

const uuidRequired: AttrSchema = { kind: 'uuid', required: true };

const attachmentRefAttrs: Readonly<Record<string, AttrSchema>> = {
  id: uuidRequired,
};

const linkMarkAttrs: Readonly<Record<string, AttrSchema>> = {
  href: { kind: 'url', schemes: HTTP_ONLY, maxLen: 2048, required: true },
};

// ── Surface definitions ──────────────────────────────────────────────────────

export const SHARED_ALLOWLISTS: SharedAllowlists = {
  'voc-description': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    leafNodes: new Set(['attachmentRef']),
    marks: new Set(['bold', 'italic', 'underline', 'code', 'link']),
    nodeAttrs: { attachmentRef: attachmentRefAttrs },
    markAttrs: { link: linkMarkAttrs },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    leafNodes: new Set<string>(),
    marks: new Set(['bold', 'italic']),
    nodeAttrs: {},
    markAttrs: {},
    allowedLinkSchemes: new Set<string>(),
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'reporter-reply': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    leafNodes: new Set(['attachmentRef']),
    marks: new Set(['bold', 'italic', 'link']),
    nodeAttrs: { attachmentRef: attachmentRefAttrs },
    markAttrs: { link: linkMarkAttrs },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'internal-comment': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'codeBlock',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ]),
    leafNodes: new Set(['mention', 'attachmentRef']),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
      mention: { actor_id: uuidRequired },
      codeBlock: {
        language: { kind: 'string', maxLen: 32, nullable: true, required: false },
      },
    },
    markAttrs: { link: linkMarkAttrs },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
};

export const SHARED_SURFACE_EXTENSION_CAPABILITIES: SharedSurfaceExtensionCapabilities = {
  'voc-description': ['bold', 'italic', 'underline', 'code', 'list', 'link', 'attachmentRef'],
  'reporter-reply': ['bold', 'italic', 'link', 'attachmentRef'],
  'public-update': ['bold', 'italic', 'list'],
  'internal-comment': ['bold', 'italic', 'code', 'list', 'link', 'mention', 'attachmentRef'],
};

export function getExtensionsForSurface(
  surface: SharedSurface,
): readonly SharedRichContentExtensionCapability[] {
  return SHARED_SURFACE_EXTENSION_CAPABILITIES[surface];
}
