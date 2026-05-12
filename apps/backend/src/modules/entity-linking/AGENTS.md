# Entity Linking Module Agent Guide

## Ownership

Entity Linking owns relation registry, link creation, link visibility enforcement, and provider coordination.
Entity Linking owns link behavior even when link tables live in the `core` database schema.

## Invariants

- Cross-system optional relationships use `entity_links` unless a direct foreign key is explicitly approved.
- `summary_visible` exposes only the approved summary contract.
- `internal_only` links are hidden from Reporter.
- Cross-workspace links are rejected.

## Provider Contract

Each linkable module must provide `entity_type`, `assertExists`, `getPermissionSubject`, `getReporterSummary`, `getInternalSummary`, and `listExpectedLinks` before Entity Linking or Dashboard code depends on that entity type.

## Verification

- Test source and target existence, workspace match, permissions, visibility, relation type validation, and Dashboard missing-link support when touched.
