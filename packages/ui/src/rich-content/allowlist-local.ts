// PLAN-22 C9 fix — UI-local copy of the shared rich-content allowlist.
//
// ADR-0016 forbids `@fops/ui` from importing `@fops/shared`. The shared
// allowlist (`packages/shared/src/rich-content/allowlist.ts`) is therefore
// duplicated here verbatim so the FE render-time defence-in-depth sanitizer
// can run without crossing the boundary.
//
// Parity with `@fops/shared` is enforced by:
//   - `apps/backend/src/lib/rich-content/__tests__/drift-vs-shared.test.ts`
//     (backend ↔ shared)
//   - `packages/ui/src/rich-content/__tests__/allowlist-drift.test.ts`
//     (UI ↔ inline fixture mirroring shared)
//
// If you change values in either side, update both and rerun both drift tests.
// Do NOT add an import of @fops/shared to this package — the boundary script
// (`scripts/check-boundaries.mjs`) walks `*.ts` and `*.test.ts` and will fail.

// ── Surface enum ─────────────────────────────────────────────────────────────

export const UI_SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type UISurface = (typeof UI_SURFACES)[number];

// ── AttrSchema ───────────────────────────────────────────────────────────────

export type AttrSchema =
  | { kind: 'uuid'; required: boolean }
  | { kind: 'url'; schemes: ReadonlySet<string>; maxLen: number; required: boolean }
  | { kind: 'string'; maxLen: number; nullable: boolean; required: boolean };

// ── SurfaceAllowlist ─────────────────────────────────────────────────────────

export interface UISurfaceAllowlist {
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

export type UIAllowlists = Readonly<Record<UISurface, UISurfaceAllowlist>>;

// ── Surface extension capabilities ──────────────────────────────────────────

export const UI_RICH_CONTENT_EXTENSION_CAPABILITIES = [
  'bold',
  'italic',
  'underline',
  'code',
  'list',
  'link',
  'mention',
  'attachmentRef',
] as const;

export type UIRichContentExtensionCapability =
  (typeof UI_RICH_CONTENT_EXTENSION_CAPABILITIES)[number];

export type UISurfaceExtensionCapabilities = Readonly<
  Record<UISurface, readonly UIRichContentExtensionCapability[]>
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

export const UI_ALLOWLISTS: UIAllowlists = {
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

export const UI_SURFACE_EXTENSION_CAPABILITIES: UISurfaceExtensionCapabilities = {
  'voc-description': ['bold', 'italic', 'underline', 'code', 'list', 'link', 'attachmentRef'],
  'reporter-reply': ['bold', 'italic', 'link', 'attachmentRef'],
  'public-update': ['bold', 'italic', 'list'],
  'internal-comment': ['bold', 'italic', 'code', 'list', 'link', 'mention', 'attachmentRef'],
};

export function getExtensionsForSurface(
  surface: UISurface,
): readonly UIRichContentExtensionCapability[] {
  return UI_SURFACE_EXTENSION_CAPABILITIES[surface];
}
