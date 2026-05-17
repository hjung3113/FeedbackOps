# Managed System Registry shape: slug identifier, archive cascade, audit detail

**ADR-0019 (Sections A, B, D, E) amends the archived-row mutation policy, cascade-race recovery, and concurrency lock for this ADR. The decisions below remain in force; consult ADR-0019 for the additions.**

`docs/implementation/04-database-and-migrations.md:104-110` locks the existence of `core.managed_systems` + `core.analytics_areas`, the AA→MS belonging rule, the workspace-plus-MS uniqueness intent for AA, and the "archive over hard delete" mandate. `docs/implementation/03-api-contracts.md:450-460` locks the eight Slice 2 endpoints. `CONTEXT.md` (Managed System / Managed System Registry / Analytics Area / Default Owner) locks the domain vocabulary.

This ADR locks the three shape decisions those documents leave open: the identifier columns on `managed_systems`, the cascade semantics when a Managed System is archived, and the audit-event detail payload that records what happened.

## Identifier: UUID PK + workspace-scoped slug + display name + optional external key

`core.managed_systems` carries four user-meaningful columns:

```text
id            uuid     primary key (ADR-0015 convention)
slug          text     workspace-scoped unique, lower-kebab, IMMUTABLE after create
name          text     display, mutable
external_key  text?    optional metadata reference into an upstream BI menu
```

`slug` is the URL- and bookmark-friendly handle. `(workspace_id, slug)` is a partial unique index (`WHERE archived_at IS NULL`) so an archived slug can be reclaimed when the registry is cleaned up (see "Archive" below). Slug is immutable after create: changing it breaks operator bookmarks, dashboard filter URLs, and any external tooling that pinned the handle. `name` is the mutable display label and carries no uniqueness constraint beyond workspace scoping (operators may legitimately rename "Power BI" to "Microsoft Power BI" without invalidating links).

`external_key` is the optional metadata reference that `CONTEXT.md:228` calls "external analytics menu identifiers are optional metadata only." It is **not** a sync key: nothing in the application keys reads, writes, or reconciles against it. Adding sync behaviour later would warrant a new ADR.

All FK columns elsewhere in the system (`voc.managed_system_id`, `task.managed_system_id`, `permission_grants.managed_system_id`, …) carry the UUID. Clients may resolve a UUID from a slug via `GET /managed-systems?slug=<slug>` but the wire-format key is always the UUID.

UUID-only was rejected because operators eyeball filter URLs and bookmark dashboard pivots long before any external sync exists, and adding a slug column retroactively after the FK rows accumulate is a painful backfill (every audit event detail, every historical link summary, every operator's saved query has to be revisited).

## Analytics Area: flat under Managed System, no parent AA

Each Analytics Area row carries `managed_system_id` and no `parent_analytics_area_id`. The Slice 2 spec's "optional parent selector" refers to the **Managed System** as parent in the admin grouping list — not to an Analytics Area tree. `CONTEXT.md:225-228` mandates AA-belongs-to-exactly-one-MS but is silent on AA hierarchy, and Slice 2 exit criteria mentions only the AA→MS relationship.

Tree-shaped AAs were rejected because they multiply downstream policy questions (does a sub-AA inherit the parent's `owner_team_id`? does archiving a parent AA cascade?) that have no MVP answer. Operators who need visual grouping can use naming conventions (`menu/permissions`, `menu/usage`) and lexicographic sort. Adding `parent_analytics_area_id` later is a nullable column migration with no row backfill.

`core.analytics_areas` shape:

```text
id                  uuid     primary key
workspace_id        uuid     not null, FK
managed_system_id   uuid     not null, FK
slug                text     unique within (workspace_id, managed_system_id, archived_at IS NULL)
name                text     display, mutable
owner_team_id       uuid?    routing/defaulting hint, FK (see ADR-0018)
archived_at         timestamp?
archived_by_actor_id uuid?   FK
```

`(workspace_id, managed_system_id, slug)` is the partial unique tuple (predicate `WHERE archived_at IS NULL`). Two MSs may carry the same AA slug (`tableau/permission-management` and `power-bi/permission-management` coexist) per the `CONTEXT.md:337` worked example.

## Archive: timestamp + actor, automatic cascade MS → AA, slug reusable after archive

Both tables carry the same two columns:

```text
archived_at          timestamp?
archived_by_actor_id uuid? FK core.actors(id)
```

This mirrors the `revoked_at` / `revoked_by_actor_id` pattern Slice 1 already established on `permission_grants` and `permission_denies`. A separate `status` enum was rejected: the timestamp carries the same active/archived signal plus the moment it happened, and the same partial-index pattern (`WHERE archived_at IS NULL`) carries to AA active-uniqueness without a second predicate vocabulary.

**Archiving a Managed System automatically archives all of its non-archived Analytics Areas in the same transaction**, with the same `archived_at` and `archived_by_actor_id`. The cascade was chosen over the two alternatives:

- Leaving children active was rejected because `GET /analytics-areas` pickers would surface AAs whose parent MS is no longer visible in the MS picker. Operators who forget to clean up children leave the registry in a state where active-looking AAs route VOC into a retired MS.
- Refusing the archive when active children exist (`409 managed_system_has_active_children`) was rejected because it forces operators through a multi-step cleanup for what is conceptually a single decision ("retire Tableau"). MVP workspaces are small enough that a transactional cascade is fast and unambiguous.

Slug reuse after archive is permitted by the partial unique indexes (`WHERE archived_at IS NULL`). An operator who archived `tableau` by mistake may re-register it with the same slug; the historical FK rows continue to point at the archived row's UUID and are unaffected. Burning the slug forever was rejected because the rename-to-avoid-collision workaround (`tableau-2`) produces ugly and confusing operator-facing labels.

`exit-criteria "archived AAs remain visible on historical records"` is satisfied at the read path: `GET /analytics-areas/:id` returns archived rows by id, and historical records (VOC, Finding, Task, Survey) join through the UUID and render the archived row's `name` with an archived-state indicator. The active picker (`GET /analytics-areas?managed_system_id=…`) filters them out by default.

## Audit detail: state-snapshot for create, change-diff for update, cascade-tracking for archive

Six events are added to `AUDIT_EVENT_TYPES` (`packages/shared/src/enums/audit-events.ts`). Names follow the snake-case single-token convention that Slice 1's F-001 fix pinned and that `audit-events.ts:1-7` documents (CONTEXT.md "Managed System Registry" supplies the `registered` verb):

```text
managed_system_registered
managed_system_updated
managed_system_archived
analytics_area_registered
analytics_area_updated
analytics_area_archived
```

Detail payload conventions:

- `*_registered` rows snapshot the row state at creation (slug, name, optional fields explicitly null when omitted). Future analyses can reconstruct the original registration from the audit row alone without joining the registry table at a specific point in time.
- `*_updated` rows record a `changes` map: `{ field_name: { from: …, to: … } }` for every changed field. Unchanged fields are omitted from the map. Empty `changes` is forbidden — a PATCH that changes nothing returns 200 without writing an audit row.
- `*_archived` rows record the archived subject id plus a `cascade_source_managed_system_id` field (nullable). When an Analytics Area is archived because its parent Managed System was archived, this field carries the parent MS id; standalone AA archives carry null. The cascading MS archive also records a `cascaded_analytics_area_ids` array in its own detail payload, so a single BI query can pivot from either direction.

`managed_system_archived` detail:

```text
{
  managed_system_id: uuid,
  cascaded_analytics_area_ids: uuid[]   // may be empty
}
```

`analytics_area_archived` detail:

```text
{
  analytics_area_id: uuid,
  cascade_source_managed_system_id: uuid | null
}
```

Per-event detail schemas live alongside the type list in `audit-events.ts` (`AUDIT_EVENT_DETAIL_SCHEMAS`), mirroring the `permission_requested` pattern Slice 1 established.

## Reopening triggers

- A second provider (sync from an external BI menu source) needs `external_key` to be authoritative rather than metadata. Reopen the identifier section; pick a sync ADR.
- Operators report that the cascade is the wrong default in practice (they want to retire a Managed System but keep its AAs visible on historical filter URLs as standalone classifications). Reopen the cascade section.
- A second Analytics Area hierarchy emerges (e.g., Tableau workbook → view sub-area becomes essential for triage routing). Reopen the AA-shape section to introduce `parent_analytics_area_id` and the inheritance rules it implies.
- Audit consumers (BI export, ops dashboard) need a different cascade-tracking shape than the `cascade_source_managed_system_id` / `cascaded_analytics_area_ids` pair. Reopen only the audit-detail section.

Slug immutability, the snake-case audit verb convention, the UUID-as-wire-key choice, and the workspace-scoped uniqueness predicates are independent of these triggers and remain in force.
