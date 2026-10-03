# UI Package Agent Guide

## Allowed Content

- UI primitives and wrappers.
- Product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- API calls.
- Backend permission decisions as truth.
- Domain mutation orchestration.
- Feature-specific route state.
- Hard-coded screen workflows.

## Design Rules

- Use semantic tokens, not raw hex values, outside token implementation files.
- Tokens are exposed to Tailwind by the CSS-first theme `src/styles/theme.css`
  (ADR-0058): every utility-facing key there aliases a `tokens.css` variable —
  add both sides in the same PR, and do not duplicate token values in the
  theme. `@theme inline` inlines utility VALUES (`rounded-sm` embeds
  `var(--radius-sm)`); Tailwind still emits self-referencing theme-layer
  variables (`--radius-sm: var(--radius-sm)`), so tokens win only because the
  consumer imports the `layer(base)` token files after the theme layer — that
  order is a consumer invariant, not a default. Consumer parity rules (v3
  Preflight pins, `space-y-*`, and `leading-*`/`tracking-*` shims) live in
  `src/styles/compat.css`, exported as `@fops/ui/styles/compat.css`; text-size
  line-height companions stay in the exported theme.
- Follow `docs/frontend/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/ui`.
- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
