# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Evidence, Coverage, Links, and integration recovery queues.

It is the UI home for FeedbackOps linking behavior, but it does not own source object lifecycles or backend authorization truth.

Finding screens and hooks live in `apps/frontend/src/features/findings/`.

## Route Boundary

Code ownership and URL mount are not the same thing here:

- Owns both code and URL for Links, at `/integration/links`.
- Owns both code and URL for Coverage, at `/integration/coverage` (route file `apps/frontend/src/routes/_authed/integration/coverage.tsx`, screen `features/integration/routes/CoverageRoute.tsx`).
- Owns the Integration Action Dashboard at `/integration` (route file `apps/frontend/src/routes/_authed/integration/index.tsx`, screen `features/integration/routes/IntegrationDashboardRoute.tsx`).
- `/integration/evidence` is planned, not yet built.
- Findings is mounted at top-level `/findings` and owned by `apps/frontend/src/features/findings/`
  (route files live in `apps/frontend/src/routes/_authed/findings/`). The direct
  `/findings/$findingId` URL redirects to `/findings?selected=:findingId`.
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

## Key files

- `apps/frontend/src/routes/_authed/integration/index.tsx` — Integration dashboard route.
- `apps/frontend/src/routes/_authed/integration/coverage.tsx` — Coverage route and URL search validation.
- `apps/frontend/src/routes/_authed/integration/links.tsx` — Links route and URL filters.
- `apps/frontend/src/features/integration/routes/IntegrationDashboardRoute.tsx` — Integration action dashboard.
- `apps/frontend/src/features/integration/routes/CoverageRoute.tsx` — coverage columns, labels, and coverage states.
- `apps/frontend/src/features/integration/routes/LinksRoute.tsx` — Links list filters, tabs, and selected state.
- `apps/frontend/src/features/integration/components/EntityLinksInventoryTable.tsx` — Entity Link inventory rows and permission state.
- `apps/frontend/src/features/integration/components/EntityRelationRow.tsx` — relation summary within an inventory row.
- `apps/frontend/src/features/integration/components/LinkStatusBadge.tsx` — Entity Link status labels and badge styles.
- `apps/frontend/src/features/integration/hooks/useEntityLinkInventory.ts` — Entity Link inventory query.
- `apps/frontend/src/lib/copy/home.ts` — shared wording used by Coverage.
- `apps/frontend/src/lib/copy/permission-reasons.ts` — shared blocked copy used by the link inventory.

## Verification

- Test missing-link queue behavior, coverage labels, link visibility states, and deep-link action restore when touched.
