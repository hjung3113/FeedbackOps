# PLAN-22 Chunk C9 — Deviations

**Branch:** `feature/22-c9-client-sanitizer-shared-allowlist`
**Scope:** Issue #41 — client render-time sanitizer + shared allowlist constant.

## Summary of deltas vs. plan

The chunk shipped as planned. Three notable adjustments:

### 1. Backend allowlist refactor: re-export shape, not adapter shape

The plan suggested "an adapter layer if BE has internal zod schemas built atop
the data." Inspection showed the BE `surface-allowlists.ts` is **pure data**
(`Set<string>`, plain attr maps, no zod). The cleanest refactor was therefore
a direct re-export from `@fops/shared`:

```ts
export const SURFACES = SHARED_SURFACES;
export const SURFACE_ALLOWLISTS: SharedAllowlists = SHARED_ALLOWLISTS;
```

This keeps every BE import path (`SURFACES`, `SURFACE_ALLOWLISTS`, `Surface`,
`SurfaceAllowlist`, `AttrSchema`) byte-stable. The existing 237-line
`surface-allowlists.test.ts` and the 609-line `sanitize.test.ts` both passed
without modification.

### 2. Surface enum: dashed (`voc-description`) not underscored (`voc_description`)

The plan suggested underscored surface names (e.g. `voc_description`). The
existing BE module already shipped dashed names, and `RichEditor.tsx`,
service code, and ADR-0011 all use the dashed convention. AGENTS.md root rule:
"Match existing docs and implementation patterns before inventing new
structure." Surface tuple kept as `'voc-description' | 'reporter-reply' |
'public-update' | 'internal-comment'`.

### 3. Existing UI test fixtures updated to real UUIDs (Rule 1: bug)

`packages/ui/__tests__/rich-content.test.tsx` used `'u1'` and `'a1'` as
mention/attachment ids. The C9 sanitizer (mirroring the server's
authoritative validator) drops nodes whose required `uuid` attrs do not match
the UUID regex. Without the sanitizer these strings rendered through, but
they never could have round-tripped from the API — the server would already
have rejected them. Updated the fixtures to `11111111-…` style UUIDs, which
restores test intent and matches production data shape. The assertions that
read `@u1` text were re-pointed at the `[data-type="mention"]` element since
the visible label comes from the actor registry, not the attr.

This is the kind of fixture drift the FE sanitizer is designed to surface.

## Behavioral notes (intentional, not deviations)

- **Sanitizer never throws.** Server sanitizer returns a typed error union;
  FE sanitizer silently drops invalid nodes and coerces hostile hrefs to `''`.
  Rationale: a renderer should always have *something* to render. The server
  pass is the source of validation errors; the FE pass is purely defensive
  against cached or stored XSS.

- **Coerce-to-`''` only for `href`.** Other URL attrs (none currently allowlisted)
  would be DROPped rather than coerced. The coerce-to-empty pattern is
  link-specific because dropping the `href` attr would leave a required-attr
  hole and cause the whole link mark to fall away; coercing keeps the surrounding
  text intact while neutralising the URL.

- **Default surface mapping.** `RichContentRenderer` accepts a new optional
  `surface` prop. When absent, `mode="reporter_visible"` → `public-update`,
  `mode="internal"` → `internal-comment`. Existing call sites do not need to
  change; they pick up the safest reader by default.

## Verification

- `pnpm --filter @fops/shared test`: 258 passed (17 files).
- `pnpm --filter @fops/ui test`: 439 passed (38 files).
- `pnpm --filter @fops/backend test`: 219 passed, 403 skipped (DB-gated).
- `pnpm --filter @fops/{shared,ui,backend} typecheck`: clean.

## Files touched

| File | New / Modified | LOC |
|---|---|---|
| `packages/shared/src/rich-content/allowlist.ts` | new | ~125 |
| `packages/shared/src/rich-content/index.ts` | new | 1 |
| `packages/shared/src/rich-content/__tests__/allowlist.test.ts` | new | ~60 |
| `packages/shared/src/index.ts` | +1 line | — |
| `apps/backend/src/lib/rich-content/surface-allowlists.ts` | reduced from 165 → ~30 (re-export) | -135 |
| `apps/backend/src/lib/rich-content/__tests__/drift-vs-shared.test.ts` | new | ~45 |
| `packages/ui/src/rich-content/sanitizeClient.ts` | new | ~210 |
| `packages/ui/src/rich-content/RichContentRenderer.tsx` | +sanitize call, new `surface` prop | ~15 |
| `packages/ui/src/rich-content/__tests__/sanitizeClient.test.ts` | new | ~115 |
| `packages/ui/__tests__/rich-content.test.tsx` | fixture UUIDs (Rule 1) | ~10 |
| `packages/ui/package.json` | + `@fops/shared` workspace dep | 1 |
