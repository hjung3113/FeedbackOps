# Findings Feature Agent Guide

## Ownership

This folder owns Finding screens and hooks: `FindingDetailPanel` and its panel tree (`FullFindingDetail`, the evidence/link/request modals, `useFindingDetailController`), plus the Finding read/mutation hooks (`useFindingsList`, `useFindingDetail`, `useFindingStatusMutation`, `useEvidenceHighlights`, `useEvidenceMutations`, `useRequestTaskFromFinding`).

It does not own source object lifecycles or backend authorization truth.

## Route Boundary

- Finding screens mount at the top-level `/findings` and `/findings/$findingId` routes; route files live in `apps/frontend/src/routes/_authed/findings/`, not in this folder.
- This folder does not own the entity-link inventory or `/integration/links` — `EntityRelationRow`, `EntityLinksInventoryTable`, `LinkStatusBadge`, and `useEntityLinkInventory` stay under `features/integration/`.

## Rules

- Finding detail is evidence-first and keeps execution links visible.
- Finding detail composes `FindingDetailPanel` → `FullFindingDetail` → `useFindingDetailController`; shared UI and hooks are under `apps/frontend/src/features/cross-system/` and `apps/frontend/src/lib/cross-system/`.
- Finding bridges evidence to execution, but backend permission checks remain authoritative; permission-limited content renders approved summaries or a request path.

## Verification

- Test Finding action CTAs, evidence summaries, and deep-link action restore when touched.
