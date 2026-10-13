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
- `/integration/evidence` is accepted, implementation pending (ADR-0065); no route is registered yet.
- Findings is mounted at top-level `/findings` and owned by `apps/frontend/src/features/findings/`
  (route files live in `apps/frontend/src/routes/_authed/findings/`). The direct
  `/findings/$findingId` URL redirects to `/findings?selected=:findingId`.
- Home may link into Integration-owned surfaces with selected object and action intent.

## Invariants

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
- Entity-link rows accept Entity Link DTOs only. VOC Cluster member presentation belongs to `apps/frontend/src/features/voc-cluster/components/detail/VocClusterMemberRow.tsx`.
- `apps/frontend/src/features/integration/components/LinkStatusBadge.tsx` — Entity Link status labels and badge styles.
- `apps/frontend/src/features/integration/hooks/useEntityLinkInventory.ts` — Entity Link inventory query.
- `apps/frontend/src/lib/copy/home.ts` — shared wording used by Coverage.
- `apps/frontend/src/lib/copy/permission-reasons.ts` — shared blocked copy used by the link inventory.

## Verification

- Test missing-link queue behavior, coverage labels, link visibility states, and deep-link action restore when touched.

## Close-out contract (ADR-0067; implementation pending)

- ADR-0067 accepts proposed/new shared compact recovery UI/public seam for Home. Integration
  owns recovery composition, source routes own full workflows. Existing three shells remain.
- Scope/category/selection/hidden/history/return intent restores via URL; readable resolved
  selection stays open. Render backend actions/visibility/hints without response identity leaks.
- Offer personal snooze (1/7 days), current-occurrence mute, hidden view/restore; refresh shared
  queries after source repairs.
- Shipped (#1088): Coverage renders server bands and the neutral `no_data` state — no local
  rules. Server `computed_at` display (56-I) remains pending.

## Analytics Area report (ADR-0069; accepted, implementation pending)

- Extend Coverage's PageShell with URL-backed `view=areas`; default overview omits `view`.
- Keep Managed System/Area/paging state and source destinations per `docs/frontend/routes-and-layout.md`.
- Render unavailable, zero, zero-denominator, loading/error/denial separately; no stale prior-scope counts.
- Operational positive counts link to exact typed source filters; repairs remain on owning source routes.
- Add the secondary Area-tab link to the existing Integration Coverage card; no new Admin/rail surface.

## Evidence inventory (ADR-0064/0065; accepted, implementation pending)

Proposed/new `/integration/evidence` is a read-only ListShell inventory of stored
highlights across readable Findings. Findings owns proposed/new
`GET /evidence-highlights` and `GET /evidence-highlights/:id`; Survey owns the
ADR-0064 safe projection. Integration renders only authorized DTOs, never raw
links/private bindings/audit JSON or response URLs. See
`docs/frontend/routes-and-layout.md` for URL keys, detail restoration and states;
`docs/implementation/api/findings.md` for eligibility-before-search/pagination.

Rows/panel identify the owning Finding; primary `Finding 보기` opens its detail
and Back preserves Evidence context. Editing/attachment/execution remains in
Finding detail, using #816's candidate/attach APIs. No standalone model, Unlinked
tab or coverage KPI. Reuse Korean chrome/source labels and shipped shell density;
prototype is a reference under ADR-0060. Verify desktop 1440, keyboard/focus,
withheld/denied/empty/error and later-page selected detail during implementation.
Preserve ordinary Links/Coverage, VOC source/reporter rules and authored notes.
