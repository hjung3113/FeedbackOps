// apps/backend/src/lib/rich-content/surface-allowlists.ts
//
// Per-surface node + mark allowlists with per-attr value schemas.
// Spec: docs/frontend/specs/voc.md §5.7. ADR-0011 names this layer authoritative.
//
// PLAN-22 C9: the canonical data now lives in `@fops/shared/rich-content/
// allowlist.ts` so the FE render-time sanitizer (packages/ui/src/rich-content/
// sanitizeClient.ts) can apply the same allowlist without re-declaring it. This
// file is a thin re-export so existing backend callers (sanitize.ts and tests)
// keep their import paths and behavior. A `drift-vs-shared.test.ts` proves the
// two layers stay in lockstep.
//
// Layering note unchanged: the sanitizer enforces attr *shape* here (type,
// format, length). Service-layer business rules (e.g. rejecting non-empty
// attachments[] until the storage slice ships) are enforced separately in
// conversation-service.ts.

import {
  SHARED_ALLOWLISTS,
  SHARED_SURFACES,
  type SharedAllowlists,
  type SharedSurface,
  type SharedSurfaceAllowlist,
  type AttrSchema as SharedAttrSchema,
} from '@fops/shared';

// ── Re-exported public surface ───────────────────────────────────────────────

export const SURFACES = SHARED_SURFACES;
export type Surface = SharedSurface;

export type AttrSchema = SharedAttrSchema;
export type SurfaceAllowlist = SharedSurfaceAllowlist;

export const SURFACE_ALLOWLISTS: SharedAllowlists = SHARED_ALLOWLISTS;
