# List empty, filtered-empty, and read-error state contract

## Status

Accepted 2026-09-28 for issue #521.

## Context

List screens need to distinguish a workspace with no records from a list whose
current user-selected filters return no records. Ordinary read failures also
need a retry path, while permission denial must keep its dedicated explanation
and request path. The shared `@fops/ui` `EmptyState` provides the visual base,
but the application owns the copy and actions for its list surfaces.

## Decision

1. `apps/frontend/src/components/ListStateMessage.tsx` is the shared
   application wrapper around `@fops/ui` `EmptyState`. It accepts a variant,
   title, body, and an optional action with a label and click handler. Existing
   permission-specific Survey actions may use its content slot.
2. Use `empty` only when the underlying data has no records. Its title and
   one-line reason describe the surface; an action is allowed only when that
   surface already has a real create or navigation action.
3. Use `filtered` when underlying records exist but a user-controlled status,
   search, or route filter leaves no visible rows. The message names active
   conditions and its `필터 초기화` action restores the surface's default
   filters while preserving unrelated scope such as Managed System.
4. Use `error` for ordinary list-read errors, with a retry action that calls the
   query's `refetch`. Permission denial remains on the existing
   `PermissionBlockedPanel` path.
5. Existing loading states and `ListShell` stay unchanged. The contract applies
   to Findings, Tasks backlog, Task Requests, Entity Links, and Surveys.

## Consequences

- Operators can tell whether a list is truly empty, filtered to zero rows, or
  unavailable, and can recover from filter misses or transient read errors.
- Findings keeps its list heading and zero count while showing these states.
- Surfaces without a user-controlled list filter have only `empty` and `error`
  states. Permission-sensitive Survey empty actions remain intact.
- `ListStateMessage` is application-level composition; shared UI primitives and
  shell behavior do not acquire product-specific copy or query behavior.

## Related

- Issue #521 — list empty/filtered/error contract
- `docs/frontend/ui-design-system.md` — ObjectList state pattern
- ADR-0020 — shell taxonomy
