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
  theme. `@theme inline` is required so theme keys can never shadow token
  variables.
- Follow `docs/frontend/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/ui`.
- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
