# Entity Links Module Agent Guide

## Ownership

Entity Links owns relation registry, link creation, link visibility enforcement, and provider coordination.
Entity Links owns link behavior even when link tables live in the `core` database schema.

## Invariants

- Cross-system optional relationships use `entity_links` unless a direct foreign key is explicitly approved.
- `summary_visible` exposes only the approved summary contract.
- `internal_only` links are hidden from Reporter.
- Cross-workspace links are rejected.
- Ordinary source and target endpoints must resolve to the same Managed System;
  command-only Survey-response links are the ADR-0064 exception, requiring
  independent source Survey and target Finding authorization in one workspace.
  The ordinary create-time check in `createLink` (`assertLinkManagedSystemCompatibility`)
  and the domain create-finding/link-finding paths are the authoritative enforcement seam.
  No DB constraint exists because `core.entity_links` is polymorphic (`source_type`/`target_type`
  pick the owning table; a CHECK cannot subquery and per-type triggers would duplicate
  authorization in SQL).
- `registeredEntityLinkPairs` in `packages/shared/src/entity-links.ts` is the canonical tuple registry (currently 13 tuples). The DB `entity_links_tuple_check` CHECK constraint must be kept in sync via migration; adding a relation type requires both a shared-list entry and a migration extending the CHECK.

## Provider Contract

Each linkable module must provide `entity_type`, `assertExists`, `getPermissionSubject`, `getReporterSummary`, `getInternalSummary`, and `listExpectedLinks` before Entity Links or Dashboard code depends on that entity type.

## Verification

- Test source and target existence, workspace match, permissions, visibility, relation type validation, and Dashboard missing-link support when touched.

## Close-out contract (ADR-0067; implemented)

- ADR-0067 adds an injected transaction-aware Dashboard transition recorder for successful
  link mutations affecting recovery predicates. Keep links canonical, record projection
  transitions in the same transaction, deduplicate/no-op/replay, and avoid command-barrel cycles.
  Dashboard must not write link/domain resolution decisions.

## Survey read-boundary cutover (ADR-0064; #740 cutover)

- Keep `core.entity_links` canonical with all statuses/history. Ordinary app SQL
  uses the filtered owner-backed `core.entity_links_app` view; exclude either Survey-response
  endpoint in every status. Revoke raw app SELECT/INSERT/UPDATE and column ACLs,
  no DELETE. Verify real conflict/RETURNING/detach paths before cutover.
- Entity Links owns narrow Survey link mutations returning local link ID/inserted
  state only. Generic counts/cursors/detach never expose opaque Survey tuples.
  Results reaches them only through the Survey-owned authorized derived-Finding seam.
- Preserve ordinary provenance and active uniqueness; app-executable functions
  remain trusted application tools, not stolen-credential unlinkability.
