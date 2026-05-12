# Dashboard Module Agent Guide

## Ownership

Dashboard owns action queues, coverage projections, missing-link projections, and dashboard read models.
Dashboard is not a passive reporting helper.

## Invariants

- Dashboard is an operational action surface, not a chart-only reporting page.
- Each actionable row must explain why it appears and what the next action is.
- Dashboard must not mutate source records directly.
- Dashboard completeness indicators must account for missing links and permission limits.

## Cross-System Rules

- Read through approved module read interfaces or projections.
- Open next actions in the owning module rather than duplicating command logic.

## Verification

- Test missing-link queues, permission-aware rows, refresh after repair, and next-action routing when touched.
