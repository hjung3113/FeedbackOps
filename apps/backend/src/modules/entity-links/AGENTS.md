# Entity Links Module Agent Guide

## Ownership

Entity Links owns relation registry, link creation, link visibility enforcement, and provider coordination.
Entity Links owns link behavior even when link tables live in the `core` database schema.

## Invariants

- Cross-system optional relationships use `entity_links` unless a direct foreign key is explicitly approved.
- `summary_visible` exposes only the approved summary contract.
- `internal_only` links are hidden from Reporter.
- Cross-workspace links are rejected.
- `registeredEntityLinkPairs` in `packages/shared/src/entity-links.ts` is the canonical tuple registry (currently 10 tuples). The DB `entity_links_tuple_check` CHECK constraint must be kept in sync via migration; adding a relation type requires both a shared-list entry and a migration extending the CHECK.

## Provider Contract

Each linkable module must provide `entity_type`, `assertExists`, `getPermissionSubject`, `getReporterSummary`, `getInternalSummary`, and `listExpectedLinks` before Entity Links or Dashboard code depends on that entity type.

## Verification

- Test source and target existence, workspace match, permissions, visibility, relation type validation, and Dashboard missing-link support when touched.
