# UI foundation: dark-only MVP, WCAG AA, CSS-var tokens, full shadcn wrap

> **Status:** Superseded by [ADR-0021](0021-pack-17-samsung-light-design-system.md) on 2026-05-20. The "dark-only in MVP" decision is reversed; FeedbackOps now ships light-only per Pack 17. This document is retained for historical context; do NOT use it for current decisions.

`docs/frontend/ui-design-system.md` (978 lines) + `DESIGN.md` + `docs/frontend/component-inventory.md` already cover anatomy, variants, states, breakpoints, semantic-token names, and accessibility rules. This ADR locks the four remaining decisions that those documents leave open.

## Theme: dark-only in MVP

FeedbackOps MVP ships **dark only**. DESIGN.md is a dark palette (Pitch Black canvas, Neon Lime accent, Linear-style depth) and `docs/frontend/ui-design-system.md` builds the entire screen mapping on top of it. Shipping a light theme alongside doubles the token-tuning, contrast-verification, and screenshot-test surface for a workforce already at home in dark operations tools.

The CSS variable structure (next section) keeps the door open: every component reads from `var(--text-primary)` etc. rather than a literal color, so a future ADR can introduce a `[data-theme="light"]` block that overrides the `:root` values without touching any component code. User-preference switching (system/light/dark) is also a future ADR.

## Accessibility target: WCAG 2.2 AA

We target **WCAG 2.2 Level AA** for production code paths:

- Text contrast ≥ 4.5:1, large text ≥ 3:1.
- Non-text UI contrast ≥ 3:1 (borders, focus rings, icons in interactive controls).
- Every interactive control has a visible focus state (already required by `ui-design-system.md` Accessibility Rules).
- Status, severity, and visibility cannot rely on color alone — a text label or icon is always present (already required by the same doc).
- Touch targets ≥ 40 × 40px on mobile widths (already required).
- Keyboard navigability for CommandMenu, menus, drawers, dialogs, and table rows (already required).

AAA was rejected because some of the DESIGN.md token contrasts (e.g. `--color-storm-cloud` `#8a8f98` against `--color-pitch-black` `#08090a` is ~7.0:1 — close but not consistent across every overlay) would force a token recolour that breaks the visual identity. AA is the industry baseline for internal tools and is achievable inside the DESIGN.md palette with minor adjustments to a few muted-text tokens.

A pre-commit CI check using `axe-core` runs against the component sandbox and the integration-slice routes. Findings at AA level fail the build; findings classified as AAA-only are reported but do not block.

## Tokens: CSS variables + Tailwind theme.extend

Tokens flow in three layers, top to bottom:

```text
DESIGN.md raw tokens                    -- Pitch Black #08090a, Neon Lime #e4f222, etc.
   ↓ defined as CSS variables on :root
packages/ui/src/styles/tokens.css        -- --color-pitch-black: 8 9 10  (HSL/RGB triples, no rgb() wrapper)
   ↓ aliased to semantic tokens on :root
packages/ui/src/styles/semantic.css      -- --surface-canvas: var(--color-pitch-black);  --text-primary: var(--color-porcelain);
   ↓ exposed to Tailwind via theme.extend
apps/frontend/tailwind.config.ts         -- colors: { 'surface-canvas': 'rgb(var(--surface-canvas) / <alpha-value>)' }
   ↓ consumed by components
packages/ui/src/* and apps/frontend/src/* -- className="bg-surface-canvas text-text-primary"
```

Rules locked here:

- Raw color tokens (`--color-*`) are **never** referenced by component or screen code. Components consume only semantic tokens (`--text-primary`, `--surface-canvas`, `--status-reporter-*`, etc.).
- Tailwind utility classes reference the semantic name (`bg-surface-canvas`, `text-text-muted`), never raw color names (`bg-pitch-black` does not exist as a class).
- The semantic-token list in `ui-design-system.md` is the authoritative inventory; adding a semantic token requires updating that doc in the same PR.
- shadcn/ui's stock CSS variable names (`--background`, `--foreground`, etc.) are remapped to our semantic names in the same `semantic.css` so shadcn components render correctly without a parallel token universe.

Hardcoded `theme.extend` colours (no CSS variables) were rejected because a future light theme — even if speculative — has zero migration cost under the variable-aliased setup and a large one if every utility class encodes a hex value.

## Component wrap: 100% via packages/ui

Every shadcn/ui (or Radix) primitive is **re-exported through `packages/ui`** before screen code can use it. `apps/frontend` imports `Button`, `Dialog`, `Combobox`, etc. only from `@fops/ui`; direct imports from `@radix-ui/*` or copied shadcn source are forbidden by lint rule.

The wrap layer's job per primitive:

- Apply our semantic tokens (so `Button` renders our colors out of the box).
- Constrain the variant surface to what `component-inventory.md` declares (e.g. `Button` exposes `primary | secondary | subtle | destructive` — no `outline`, no `ghost`, no `link` unless added to the inventory in the same PR).
- Enforce required props for accessibility (e.g. `IconButton` requires `aria-label`; `Dialog` requires a `title` slot).
- Add FeedbackOps-only props where the primitive is too generic (e.g. `Button` accepts `loading?: boolean`; `Combobox` accepts `permissionGuard?` for `request_access` states).

Replacing a shadcn primitive (or upgrading it) becomes a single-file change rather than a sweep across screens. The "governed shadcn/ui-style architecture" described in `docs/tech-stack/component-stack.md` is exactly this layer.

Hybrid use (small primitives unwrapped, complex ones wrapped) was rejected because the import-path consistency benefit disappears as soon as some surfaces import from two roots — code review can no longer assume `<Button>` matches our contract by name alone.

## Adjacent picks

These are small enough not to deserve a separate ADR but need an answer so screen code can land:

- **Icon library**: `lucide-react`. shadcn defaults to it; aligned with DESIGN.md aesthetic; tree-shakeable.
- **Date library**: `date-fns` + `date-fns-tz`. Smaller than Luxon, immutable, TS-native. Korean locale built in. Timezone-aware formatting for audit and Reporter Summary timestamps.
- **Drag and drop**: deferred. No MVP screen requires DnD; the next requirement (e.g. Task board reorder) will land with its own ADR pick (`@dnd-kit/core` is the likely choice).
- **Chart library**: deferred. Dashboard is action-queue (CONTEXT.md), not chart-first; charts arrive with a future analytics phase that will pick `Recharts` or `Visx` then.
- **Component sandbox**: Storybook 8, served from `apps/frontend` workspace, with the axe-core integration above. Mandatory for `packages/ui` primitives; optional for `apps/frontend/src/features/*` screens.

## What this ADR locks

- Dark theme only in MVP; CSS variable structure preserved so a future light theme is non-breaking.
- WCAG 2.2 AA is the build-fail line; AAA findings are reported, not enforced.
- Semantic tokens are the only ones component code touches; raw color tokens are private to the token files.
- Every shadcn/Radix primitive is wrapped in `packages/ui` before screen use; direct imports are lint-banned.
- Icons via `lucide-react`; dates via `date-fns`; Storybook 8 with axe-core; DnD and charts deferred.

## Reopening

Introducing a light theme, raising the accessibility target to AAA, exposing raw color tokens directly, or allowing direct shadcn imports each warrants a new ADR with a migration story for affected components and lint rules. Adding new semantic tokens, new wrapped primitives, or new variants within the established structure is *not* a reopen.
