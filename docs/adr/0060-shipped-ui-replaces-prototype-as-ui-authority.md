# ADR-0060: The shipped UI replaces the prototype as the UI authority

Date: 2026-10-05

## Status

Accepted 2026-10-05 by the owner. Supersedes the "prototype remains the spec for everything not listed here" clause of ADR-0057, the last sentence of ADR-0057 A2 ("Prototype wording remains authoritative…"), ADR-0020 §3 and its "Frontend specs reference the manifest" consequence, and the root `AGENTS.md` "Prototype Is The Spec" rule.

## Context

Root `AGENTS.md` treated `docs/design-prototype/` as the functional, visual, and copy specification. Every page-level change had to be compared against the prototype's rendered screens, and every divergence needed an ADR or an owner OK. That made sense while screens were being built from nothing.

Slices 1-29 have shipped every MVP surface. Since then the product has deliberately moved past the prototype in many places: ADR-0022, ADR-0037 to ADR-0041, ADR-0057 (including the Korean-chrome policy), and the WCAG `-label` tokens. The owner judged on 2026-10-05 that per-change prototype comparison now adds a gate without adding quality.

## Decision

1. For existing surfaces, the authority is the shipped UI:
   - the components in `apps/frontend` and `packages/ui`;
   - the copy modules in `apps/frontend/src/lib/copy/*`;
   - the committed Playwright baselines in `apps/frontend/tests/visual/`.

   A change to an existing screen extends that screen's current pattern. No prototype comparison and no deviation record are required.
2. `docs/design-prototype/` becomes a design reference. Consult it when building a surface that it drew and the product does not have yet (for example the planned Evidence route). Even then it is a starting point, not a contract.
3. Behavior and acceptance criteria still come from the specs and ADRs (`docs/design/*`, `docs/frontend/specs/*`, `docs/implementation/*`).
4. These rules are unchanged:
   - the three-shell taxonomy (ADR-0020);
   - the Korean-chrome copy policy (ADR-0057 A2, amended by #675);
   - the "do not port" list in root `AGENTS.md`: hash routing, `window` globals, `document.execCommand`, synthetic data, draft-only panels.
5. The visual regression harness stays. It compares the app against its own committed baselines, not against the prototype.

## Consequences

- The FE page-level "prototype comparison" step is removed from `apps/frontend/AGENTS.md`. A design review looks at the rendered change before and after, plus the visual-harness diff.
- The prototype-deviation ADRs (0022, 0037-0041, 0057) remain valid as product decisions. Future divergences from the prototype need no ADR.
- `docs/design-prototype/screenshots/final-baselines/` stops being a gate input. It remains as a picture of the original design.
- The `token-fidelity` snapshot test in `packages/ui` stays as is. It pins the token values, and any change to them is a deliberate token change.
