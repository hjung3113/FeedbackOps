# ADR-0059: Deferred MVP requirements found by the 2026-10-05 doc audit

Date: 2026-10-05

## Status

Accepted 2026-10-05 by the owner (recommendation approved in session).

## Context

The 2026-10-05 doc-to-code audit found four behaviors that the design docs describe as MVP requirements but that were never built, and that no ADR deferred. MVP shipped without them (slices through 29 are released). Leaving them as unqualified requirements makes the design docs read as if the behavior exists.

A fifth gap, revoking an active permission grant or deny, is not deferred here. It is tracked as issue #762 because an Admin has no way to take back a capability without a database write.

## Decisions

### D1 — Default owner and reviewer resolution is deferred, except the Survey operator default

The Survey operator default ships: Survey create resolves `operator_actor_id` from the explicit value, then `managed_systems.default_survey_operator_actor_id`, then the creator (`apps/backend/src/modules/surveys/authoring.ts`).

VOC owner, Finding owner, Task Request reviewer, and Task owner default resolution are deferred. `managed_systems.default_owner_actor_id` / `default_owner_team_id` stay stored and editable, but no create path reads them; VOC create leaves the owner empty. There is no `default_resolved` creation metadata. Reopen when routing demand appears; the resolution order in `docs/design/09-permission-access.md` is the starting design.

### D2 — Survey templates are deferred

FR-SURVEY-001's "Survey can be created from template" is not built. Survey creation uses the creation dialog (ADR-0039) and the builder.

### D3 — The Dashboard recovery-item model is deferred

The shipped surface is `GET /dashboard/summary`: KPIs, action-queue counts with `next_action` hops, and coverage. The following parts of `docs/design/08-dashboard-system.md` and the `docs/implementation/03-api-contracts.md` global rules are deferred target design:

- shared `recovery_item_id`
- the recovery-item detail panel
- per-actor snooze and mute
- the three-month resolved history
- `computed_at`
- `responsible_actor_hint`

The Outcome Survey follow-up flow keeps its own recovery identity (ADR-0055).

### D4 — Public survey links stay unscheduled

ADR-0035 and ADR-0036 stay Proposed and unscheduled. MVP survey distribution is the authenticated in-app link `/surveys/:id/respond`.

## Consequences

- The design docs keep the requirement text and point here where they state D1-D4 behavior, so a reader does not mistake them for shipped behavior.
- Building any of D1-D4 later needs its own issue and, where the design is incomplete, its own ADR. This ADR is not a backlog.
