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
  `@ap/ui` at the `sdk-v0.5.0` tag. The local `src/index.ts` preserves the
  `@fops/ui` API; `src/components/shadcn/*` and selected `src/utils/*`
  files are compatibility re-exports only. Do not add implementation there.
- Bundle 2a (panel, toolbar, forms, and feedback components) is sourced from
  `@ap/ui` at `sdk-v0.5.0`. The matching files under `src/{panel,toolbar,forms,
  feedback}` and their entries in `src/index.ts` are compatibility re-exports;
  keep the FeedbackOps tests local. `src/panel/useJumpGuard.ts` remains local
  because the SDK does not export that private helper, and its existing test
  imports the helper directly.
- Bundle 2b (layout shells and the detail slot) is sourced from `@ap/ui` at
  `sdk-v0.5.0`. `src/layout/*` are compatibility re-exports. `useDetailPanelSlot(node)`
  is `@ap/ui`'s `useDetailPanelContent` under the FeedbackOps name (`undefined`
  clears, `null` registers a closed registrant). `DetailPanelSlotContext` is gone:
  `AppFrame` wraps its frame in `DetailPanelSlotProvider` and renders the host
  through `useDetailPanelSlotHost()`, and the provider owns the expanded state
  (toggle, Esc, reset on key change) and `DetailPanelFullscreenContext`. Tests that
  render a shell with `detailPanel` mount `DetailPanelSlotProvider` plus a host div.
  Overlapping registrants log the SDK's `[DetailPanelSlot] Multiple registrants; the last registrant wins.`
- Bundle 3a (`ObjectRow`, `UserAvatar`, `UserChip`, `ProgressMeter`,
  `SeverityIndicator`, `PermissionBlockedPanel`, and `StatusBadgeFrame`) is sourced
  from `@ap/ui` at `sdk-v0.5.0`, per the SDK ownership decisions in upstream ADR-0050 and ADR-0052.
  Their matching files under `src/{data,identity,indicators,permissions,badges}` are
  compatibility re-exports. Keep FeedbackOps tests local. `SEVERITY_LABELS` stays
  in the local `SeverityIndicator` module because `@ap/ui` does not expose that
  value from its package entry and the local `SeverityBadge` uses it.
- FeedbackOps-owned product/domain components remain local under
  `src/{badges,data,entity,identity,indicators,permissions,rich-content}`.
  `src/internal/useHorizontalOverflow.ts` also remains local. Rich-content stays
  here for now (ADR-0011); upstream ADR-0052 restored an SDK copy of the editor,
  renderer and allowlist in `sdk-v0.5.0`, so switching it to `@ap/ui` is a later
  bundle (the allowlist original stays in `packages/shared`). FeedbackOps owns the UI allowlist in `src/rich-content/allowlist-local.ts`,
  which mirrors the canonical `packages/shared` contract and is drift-tested; the
  ADR-0016 package boundary keeps `@fops/ui` from importing `@fops/shared`.
  Keep `DetailPanelFullscreenContext` sourced from `@ap/ui` for all consumers.
- The frontend declares the same `@ap/ui` tag directly so its stylesheet
  resolver can reach bundle-1 CSS. It imports
  `@ap/ui/styles/{tokens,semantic,theme,compat}.css` in that order, then
  `@ap/ui/styles/sources.css`.
  Preserve `layer(base)` on the token and semantic imports. Do not use
  `@ap/ui/styles.css`, which adds the platform extension layer.
- To bump the SDK tag, verify the new tag exports the full public API and
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
