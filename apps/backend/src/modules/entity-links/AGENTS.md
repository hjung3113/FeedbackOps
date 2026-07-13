# Entity Links Module Agent Guide

## Ownership

Entity Links owns relation registry, link creation, link visibility enforcement, and provider coordination.
Entity Links owns link behavior even when link tables live in the `core` database schema.

## Invariants

- Cross-system optional relationships use `entity_links` unless a direct foreign key is explicitly approved.
- `summary_visible` exposes only the approved summary contract.
- `internal_only` links are hidden from Reporter.
- Cross-workspace links are rejected.
- The `entity_links_tuple_check` CHECK constraint (`apps/backend/src/db/schema/core.ts`, `entityLinks` table) allows exactly these `(source_type, target_type, relation_type)` tuples: `('voc','voc','related_to')`, `('voc','finding','created_finding')`, `('voc','finding','evidence_of')`. Adding a new relation type requires a migration that extends this CHECK constraint — do not attempt to add a relation type in application code alone.

## Provider Contract

Each linkable module must provide `entity_type`, `assertExists`, `getPermissionSubject`, `getReporterSummary`, `getInternalSummary`, and `listExpectedLinks` before Entity Links or Dashboard code depends on that entity type.

## Verification

- Test source and target existence, workspace match, permissions, visibility, relation type validation, and Dashboard missing-link support when touched.
