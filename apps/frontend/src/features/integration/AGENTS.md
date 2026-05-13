# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Findings, Evidence, Coverage, Links, and integration recovery queues.

It is the UI home for FeedbackOps linking behavior, but it does not own source object lifecycles or backend authorization truth.

## Route Boundary

- Owns `/integration`, `/integration/findings`, `/integration/evidence`, `/integration/coverage`, and `/integration/links`.
- Findings, Evidence, Coverage, and Links are Integration routes, not top-level navigation.
- Home may link into Integration with selected object and action intent.

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
