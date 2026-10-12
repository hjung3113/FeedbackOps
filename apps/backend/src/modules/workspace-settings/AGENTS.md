# Workspace Settings Module Agent Guide

## Ownership

Workspace Settings owns workspace-level policy storage and its admin-only API.
Consumers read the exported resolved-settings seam; they do not write this
table directly.

## Invariants

- A missing row resolves to the documented defaults.
- PATCH serializes through the singleton row and audits effective changes only.
- Policy consumer wiring belongs to its owning module and is out of scope here.

## Close-out contract (ADR-0067; implementation pending)

- ADR-0067 adds proposed/new five-metric Coverage pairs, default 75/40, integer
  `0 <= warn < good <= 100`. Missing keys resolve defaults; unknown/reserved keys reject.
- Partial maps merge complete pairs under the singleton lock; strict resolved/audit schemas
  retain all effective per-metric changes. No-op stays audit-free; consumers own color behavior.
