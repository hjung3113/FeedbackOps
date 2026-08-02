# Permission request composition and Managed System owner selection

## Status

Accepted 2026-08-03 for issues #274 and #278.

## Context

The UX D13 deferral treated return-to behavior as a schema change and slice-sized backend task. That premise was incorrect. `return_route_intent` already exists in the permission request table (`apps/backend/src/db/schema/permission.ts`), the POST parser (`apps/backend/src/modules/permissions/routes.ts`), and the request service (`apps/backend/src/modules/permissions/request-service.ts`). The missing work was frontend composition and call-site wiring.

Permission request creation also already accepts a written reason and optional expiration. Managed System registration and update already accept nullable actor and team default-owner fields. `GET /actors?workspace=current` is available to every authenticated member of the current workspace and returns actor display names, email addresses, and role levels.

The current permission routes expose create and read operations for requesters and decision operations for administrators. They expose no requester cancel or edit endpoint.

## Decision

A requester must confirm the server-provided capability and Managed System scope and enter a non-empty reason before submission. Expiration remains optional because the backend contract makes it optional and some least-privilege needs are ongoing rather than meaningfully time-bound. When supplied, the frontend sends the chosen expiration and always sends a non-empty `return_route_intent` for the originating surface.

After creation, the frontend shows the returned request ID together with capability, scope, reason, status, and creation time. Request cancellation and modification are excluded because implementing them without a corresponding backend endpoint would invent a frontend-only lifecycle.

Managed System registration and editing use one owner selection state. The state is unassigned, one Actor, or one team; it cannot contain both IDs. This matches the domain meaning of one default responsibility target and avoids ambiguous precedence between actor and team defaults. Owner remains optional.

The owner picker renders Actor display names from `GET /actors?workspace=current`. This does not widen the authorization boundary because the endpoint already exposes the workspace Actor list to every workspace member. Email is not rendered: it is unnecessary for the owner-selection task and would expose more personal data than the interface needs. A pre-existing team owner may be resolved by ID for display, but the current API has no workspace-wide team-list endpoint, so this change does not invent one.

## Consequences

Permission requests become attributable and reviewable without a backend or shared-schema change, and approval workflows retain a route intent back to the originating surface.

Managed Systems can be registered with an Actor default owner, systems with an unknown owner can be repaired through editing, and unassigned systems are labeled explicitly. Supporting selection of a new team beyond an already-known team ID requires a future, authorized team-candidate read contract.
