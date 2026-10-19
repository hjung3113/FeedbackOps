# UI Package Agent Guide

## Allowed Content

- UI primitives and wrappers.
- Product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- API calls.
- Imports from `@fops/shared` or `apps/*` (ADR-0016, enforced by `pnpm check:boundaries`); mirror the constant locally, as `src/rich-content/allowlist-local.ts` does.
- Backend permission decisions as truth.
- Domain mutation orchestration.
- Feature-specific route state.
- Hard-coded screen workflows.

## Design Rules

- Use semantic tokens, not raw hex values, outside token implementation files.
- Bundle 1 (tokens, motion utilities, and shadcn primitives) is sourced from
  `@ap/ui` at the `sdk-v0.2.0` tag. The local `src/index.ts` preserves the
  `@fops/ui` API; `src/components/shadcn/*` and selected `src/utils/*`
  files are compatibility re-exports only. Do not add implementation there.
- Bundle 2 and product/domain components remain local under `src/{badges,data,
  entity,feedback,forms,identity,indicators,layout,panel,permissions,
  rich-content,toolbar}`. `src/internal/useHorizontalOverflow.ts` and
  `src/layout/useDetailPanelSlot.ts` (including `DetailPanelSlotContext`)
  also remain local.
- The frontend declares the same `@ap/ui` tag directly so its stylesheet
  resolver can reach bundle-1 CSS. It imports
  `@ap/ui/styles/{tokens,semantic,theme,compat}.css` in that order, then
  `@ap/ui/styles/sources.css`.
  Preserve `layer(base)` on the token and semantic imports. Do not use
  `@ap/ui/styles.css`, which adds the platform extension layer.
- To bump the bundle-1 tag, verify the new tag exports the full public API and
  CSS subpaths, update the `@ap/ui` git ref in both
  `packages/ui/package.json` and `apps/frontend/package.json`, refresh the
  lockfile resolution, and check index export parity, the consumer CSS
  contract, and dependency/patch constraints. Keep TipTap at 3.23.5 and
  `@formkit/auto-animate@0.10.0` with its workspace patch unless a separate
  decision changes those constraints.
- A new Tailwind theme key must also be registered in the `@ap/ui` theme and
  its `cn` merge configuration. tailwind-merge knows only Tailwind's default
  scales, so an unregistered `text-caption` reads as a text color and `cn`
  drops it next to `text-text-muted` (#782).
- `components.json` here only points `@shadcn/lint` at the app's Tailwind
  entry (ADR-0062). It is not a shadcn CLI config; use the intake guidance in
  `docs/tech-stack/component-stack.md`.
- Follow `docs/frontend/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/ui`.
- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
