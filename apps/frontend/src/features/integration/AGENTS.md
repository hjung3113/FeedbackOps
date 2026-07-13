# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Findings, Evidence, Coverage, Links, and integration recovery queues.

It is the UI home for FeedbackOps linking behavior, but it does not own source object lifecycles or backend authorization truth.

## Route Boundary

Code ownership and URL mount are not the same thing here:

- Owns component/hook implementation for Findings, but Findings is mounted at the **top-level** `/findings` and `/findings/$findingId` routes (route files live in `apps/frontend/src/routes/_authed/findings/`), not under `/integration`.
- Owns both code and URL for Links, at `/integration/links`.
- `/integration/evidence` and `/integration/coverage` are planned, not yet built.
- Home may link into Integration-owned surfaces with selected object and action intent.

## Invariants

- Finding bridges evidence to execution.
- Entity Links are canonical cross-system history for optional relationships.
- Missing-link queues are policy-driven, not automatic guilt for every unlinked record.
- Visibility must respect backend-provided link summaries and permission states.

## Rules

- Finding detail is evidence-first and keeps execution links visible.
- Coverage must be labeled as partial integration coverage.
- Link views must not imply arbitrary graph editing beyond approved relation types.
- Cross-system creation flows must preserve source context and return users to the original work surface when appropriate.

## Verification

- Test Finding action CTAs, evidence summaries, missing-link queue behavior, coverage labels, link visibility states, and deep-link action restore when touched.
