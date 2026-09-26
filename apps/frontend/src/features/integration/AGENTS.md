# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Evidence, Coverage, Links, and integration recovery queues.

It is the UI home for FeedbackOps linking behavior, but it does not own source object lifecycles or backend authorization truth.

Finding screens and hooks live in `apps/frontend/src/features/findings/`.

## Route Boundary

Code ownership and URL mount are not the same thing here:

- Owns both code and URL for Links, at `/integration/links`.
- Owns both code and URL for Coverage, at `/integration/coverage` (route file `apps/frontend/src/routes/_authed/integration/coverage.tsx`, screen `features/integration/routes/CoverageRoute.tsx`).
- `/integration/evidence` is planned, not yet built.
- Findings is mounted at the top-level `/findings` and `/findings/$findingId` routes and owned by `apps/frontend/src/features/findings/` (route files live in `apps/frontend/src/routes/_authed/findings/`).
- Home may link into Integration-owned surfaces with selected object and action intent.

## Invariants

- Finding bridges evidence to execution.
- Entity Links are canonical cross-system history for optional relationships.
- Missing-link queues are policy-driven, not automatic guilt for every unlinked record.
- Visibility must respect backend-provided link summaries and permission states.

## Rules

- Coverage must be labeled as partial integration coverage.
- Link views must not imply arbitrary graph editing beyond approved relation types.
- Cross-system creation flows must preserve source context and return users to the original work surface when appropriate.

## Verification

- Test missing-link queue behavior, coverage labels, link visibility states, and deep-link action restore when touched.
