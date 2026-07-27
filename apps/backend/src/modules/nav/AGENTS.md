# Navigation Read Model Agent Guide

## Ownership

Navigation owns the read-only aggregation that supplies sidebar badge counts.
It does not own Dashboard action queues, domain records, or navigation layout.

## Invariants

- A count is obtained through the owning module's list predicate and caller read scope.
- Do not emit a key without a real backing list filter.
- `managed_system_id` narrows the same way as the backing list route.
- A key may be absent only because it has no backing filter or because resolving its
  backing list scope raises `permission.denied` or `permission.scope_required`.
  Absence is permission-shaped and is not a zero count; unexpected failures propagate.
