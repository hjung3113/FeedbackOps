# Teams placeholder schema: lay the table in Slice 2, defer CRUD

**ADR-0019 Section C tightens the `core.teams` role grant from SELECT/INSERT/UPDATE/DELETE to SELECT only for `fops_app` (review DB-003 resolved an internal contradiction between line 23 and line 39 below). The placeholder narrative below remains in force; consult ADR-0019 for the active grant.**

`docs/implementation/04-database-and-migrations.md:36` lists `core.teams` as one of the core tables. Line 109 locks `analytics_areas.owner_team_id` as a routing/defaulting hint and assumes the FK target exists. `CONTEXT.md:103-104` defines **Default Owner** as "the Actor or team prefilled as responsible for a Managed System." But `docs/implementation/08-mvp-slice-plan.md` never names a slice that introduces teams — Slice 2 lists only managed_systems and analytics_areas, and later slices target product domains (VOC, Finding, Task, Survey).

This ADR resolves the gap by binding the teams table to Slice 2 as a **placeholder** — schema + FKs only, no management API, no admin UI, no seed rows. The product slice that first needs operator-managed teams may add the management surface without a second schema migration.

## What Slice 2 ships

```text
core.teams
- id              uuid     primary key
- workspace_id    uuid     not null, FK core.workspaces(id)
- name            text     not null
- archived_at     timestamp?
- archived_by_actor_id uuid? FK core.actors(id)
- created_at      timestamp
- updated_at      timestamp
```

Constraints:

- `(workspace_id, name)` partial unique (`WHERE archived_at IS NULL`). Identical to the Managed System Registry pattern in ADR-0017 — operators can reuse a team name after archiving.
- Standard role grants: `fops_app` gets SELECT/INSERT/UPDATE/DELETE; `fops_migrate` retains ALL. The archive convention (`archived_at` + `archived_by_actor_id`) is consistent with ADR-0017 so the same query helpers and partial-index pattern apply.

Slice 2 simultaneously adds the FK columns that the table is needed for:

```text
managed_systems
- default_owner_actor_id  uuid?   FK core.actors(id)
- default_owner_team_id   uuid?   FK core.teams(id)
- CHECK: at most one of (default_owner_actor_id, default_owner_team_id) is non-null

analytics_areas
- owner_team_id           uuid?   FK core.teams(id)
```

The `XOR-or-both-null` check on `managed_systems` forbids "owned by both actor X and team Y" — `CONTEXT.md:103` says "Actor **or** team" and a downstream consumer (Slice 3 VOC default-owner resolution) needs a single answer per row, not a precedence rule.

`fops_app` cannot INSERT/UPDATE/DELETE on `core.teams` for normal product flows because no Slice 2 application service touches it. Tests insert directly via the migrate role when team-aware coverage is needed.

## What Slice 2 does not ship

- No `GET/POST/PATCH /teams` endpoints. `docs/implementation/03-api-contracts.md` does not list them in Slice 2's section; the placeholder respects that boundary.
- No `/admin/teams` route or UI surface.
- No seed rows. The Slice 2 seed populates managed_systems and analytics_areas with default_owner_actor_id pointed at the existing mock-admin-1 actor; no AA in the seed sets owner_team_id.
- No audit events. The vocabulary added in ADR-0017 covers MS/AA only. When the future teams slice lands, it will introduce `team_registered` / `team_updated` / `team_archived` per the same naming convention.

## Alternatives considered

- **Slice 2 ships teams with full CRUD.** Rejected because Slice 2's surface is already four feature areas (registry table, registry API, picker components, admin UI) for a slice that is sized as one of nine. Adding a fifth feature area with its own permission gate, audit events, and admin route doubles the testable surface for a feature that has no MVP demand signal. The placeholder pattern is what migrations are for: the schema decision is locked once, the management surface arrives when there is a use case.
- **Slice 2 ships the FK columns without the FK target.** Rejected because the column would be a nullable `uuid` referencing nothing, and the first product slice that resolves a default owner would either need to defer the resolution branch or fail-soft when the join returns nothing. Both shapes are worse than an empty table the application can join against.
- **Slice 2 omits the owner_team_id columns entirely.** Rejected because `04-database-and-migrations.md:109` locks the column on `analytics_areas`; shipping Slice 2 without it would leave the codebase inconsistent with the locked DB spec for the duration of every slice that follows.
- **Use actor_id everywhere and skip teams in MVP.** Rejected because `CONTEXT.md:104` calls out "Actor or team" explicitly. Re-litigating that decision is out of scope for this ADR.

## Reopening triggers

- A product slice introduces the management surface (CRUD endpoints, `/admin/teams` route, audit events). At that point the team table grows from placeholder to first-class; this ADR's "what does not ship" list is the natural starting point for the new slice's "what does ship" list.
- A second tenancy model (teams that span workspaces, or teams that are workspace-mandatory rather than optional) emerges. Reopen the constraint section.
- The XOR-or-both-null check on `managed_systems` proves wrong — operators want both an actor *and* a team to receive the default-owner prefill. Reopen the constraint section and adjust the Slice 3 default-owner resolution rule together.

Schema column names, the archive convention, and the FK targets are stable independent of the management-surface trigger and remain in force when that slice lands.
