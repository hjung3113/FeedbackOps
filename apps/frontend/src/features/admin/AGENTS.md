# Admin Feature Agent Guide

## Ownership

Admin owns frontend route composition for Managed System Registry, Analytics Areas, Permission Requests, active permission grants and denies, workspace settings, and administrative review queues.

It does not own source-system lifecycles, Entity Link relation semantics, or application-service permission decisions.

The canonical term is "Analytics Area" (per `docs/design/03-core-platform.md` and the actual routes/modules). "Product Area" in older docs is a legacy synonym for the same concept — do not treat them as two entities.

## Route Boundary

- Owns `/admin/managed-systems`, `/admin/analytics-areas`, `/admin/permissions/requests`, `/admin/permissions/grants`, and `/admin/settings` (implemented — `WorkspaceSettingsScreen`, see `apps/frontend/src/features/admin/settings/`).
- Analytics Areas, Permission Requests, active permission grants and denies, Managed System Registry, and workspace settings are Admin routes, not top-level work routes.

## Invariants

- Analytics Area is business context, not a forced mirror of routes or code modules.
- Managed System Registry provides scope, filters, and default owners/reviewers; it does not create separate route trees.
- Explicit Deny overrides general Allow.
- Sensitive permission decisions are auditable.

## Rules

- Analytics Area management should use a compact tree and detail panel.
- Permission Request review should show requester, scope, reason, risk, expiration, and decision state.
- Managed System defaults prefill responsibility; they do not remove explicit owner/reviewer fields from records.
- Do not expose complex permission matrix builders in MVP.

## Key files

- `apps/frontend/src/routes/_authed/admin/managed-systems.tsx` — mounts the Managed System registry.
- `apps/frontend/src/routes/_authed/admin/analytics-areas.tsx` — mounts Analytics Areas and wires the URL search schema in `apps/frontend/src/features/admin/analytics-areas/search.ts`.
- `apps/frontend/src/routes/_authed/admin/permissions/requests.tsx` — mounts Permission Request review and validates URL state.
- `apps/frontend/src/routes/_authed/admin/permissions/grants.tsx` — mounts active grants and denies and validates URL state.
- `apps/frontend/src/routes/_authed/admin/settings.tsx` — mounts workspace settings.
- `apps/frontend/src/features/admin/managed-systems/ManagedSystemsScreen.tsx` — registry list and defaults.
- `apps/frontend/src/features/admin/analytics-areas/AnalyticsAreasScreen.tsx` — Analytics Area page composition.
- `apps/frontend/src/features/admin/analytics-areas/AnalyticsAreasList.tsx` — Analytics Area tree list.
- `apps/frontend/src/features/admin/analytics-areas/AnalyticsAreaDetail.tsx` — selected Analytics Area detail.
- `apps/frontend/src/features/admin/permissions/permission-requests-screen.tsx` — request tabs, list, and status badges.
- `apps/frontend/src/features/admin/permissions/permission-grants-screen.tsx` — active grants and denies with revoke/lift detail actions.
- `apps/frontend/src/features/admin/permissions/permission-request-detail.tsx` — request detail and decision actions.
- `apps/frontend/src/features/admin/permissions/permission-requests-search.ts` — request URL tabs and status labels.
- `apps/frontend/src/features/admin/settings/WorkspaceSettingsScreen.tsx` — editable workspace settings.

## Verification

- Test Analytics Area tree restore, Managed System default editing, permission approval/rejection/revocation states, explicit deny display, and blocked-state return paths when touched.
