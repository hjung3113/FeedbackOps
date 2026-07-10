# ADR-0029: Human Display ID Scheme

Date: 2026-07-10

## Status

Accepted

## Context

Tasks, Findings, VOC Clusters, and Task Requests currently have UUID primary
keys but no human-readable identifier. The product UI and prototype expect
workspace-local identifiers such as `TASK-1000`, `FIN-1000`, `CLU-1000`, and
`REQ-1000` rather than raw UUIDs.

VOC already ships with a per-workspace `VOC-` display ID counter implemented in
`voc.*`. That implementation is the precedent for sequential, workspace-local
human IDs, but VOC remains a grandfathered exception on its own
`voc.workspace_display_counters` table and `voc.next_voc_display_id` function.

## Decision

Add a shared `core.display_counters` table keyed by
`(workspace_id, entity_type)` for the four new display-ID streams:

```text
task -> TASK-
finding -> FIN-
cluster -> CLU-
task_request -> REQ-
```

Add `core.next_display_id(uuid, text)` as a `SECURITY DEFINER` function owned by
`fops_migrate`, executable by `fops_app`, with `search_path` fixed to
`pg_catalog, core`. The function maps `entity_type` to the prefix internally
and rejects unknown values. The table also has a CHECK constraint limiting
`entity_type` to the four supported values.

Each target table receives a nullable `display_id text` column first:

```text
task.tasks
finding.findings
voc_cluster.voc_clusters
task_request.task_requests
```

Existing rows are backfilled per workspace using `created_at ASC, id ASC`, with
the first row assigned suffix `1000`. Counters are seeded to
`1000 + count(existing rows)` per workspace and entity type. Each table gets a
workspace-local unique index on `(workspace_id, display_id)`.

`display_id` stays nullable in migration 0027. Later implementation tasks will
route all insert paths through `core.next_display_id`; only after that is true
will a separate migration promote the four columns to `NOT NULL`.

## Alternatives Rejected

### Per-Schema Replica

Replicating VOC's per-schema counter table and function into `task`,
`finding`, `voc_cluster`, and `task_request` would multiply the same mechanism
four times. It would also make prefix validation and grants harder to keep
consistent. A shared `core` counter keeps one implementation while preserving
independent per-entity streams.

### Global Sequence

A single global sequence would make identifiers unique across workspaces, but
the product operates inside workspace context and VOC already established
workspace-local numbering. Global numbering would leak cross-workspace volume
and create larger, less useful numbers without solving a current product
problem.

### VOC Migration

Moving VOC onto the new shared counter would touch already shipped behavior for
cosmetic consistency. VOC's current `voc.*` counter is working and isolated, so
it remains the grandfathered exception. The shared scheme applies only to Task,
Finding, VOC Cluster, and Task Request.

## Consequences

- `TASK-1000`, `FIN-1000`, `CLU-1000`, and `REQ-1000` may repeat across
  workspaces but are unique within a workspace and entity table.
- Concurrent allocation for the same `(workspace_id, entity_type)` is serialized
  by the counter row update and defended by the table-level unique indexes.
- API DTOs should expose the field as snake_case `display_id`, matching VOC.
- Backfill order is deterministic but not semantically meaningful beyond
  preserving a stable created-time order.
- The system temporarily allows `NULL` display IDs until the later insert-path
  tasks are complete and migration 0028 can set `NOT NULL`.
