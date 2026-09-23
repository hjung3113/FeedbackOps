# My Work Feature Agent Guide

## Ownership

Not implemented. ADR-0038 excludes a My Work view from MVP. ADR-0040 keeps this directory as the future implementation location only.

This folder does not own a screen. Home's assigned-work panel is `features/home/`, not this directory.

## Route Boundary

- `/my-work` is not a registered route. Do not add one in MVP.
- Do not treat `/tasks?view=my` as this feature. That search value is an unfiltered backlog alias of `TaskListRoute`.

## Rules

- Backend permissions are authoritative; Role Level labels are display hints only.
- Linked context must use approved summaries from backend responses.
- Keep queues compact, list-first, and action-oriented.
- Do not create per-Managed-System route trees; use Managed System filters and defaults.

## Verification

- No route tests until a route exists. A change that adds `/my-work` or makes `view=my` an assignee filter is out of MVP and needs an ADR reopen, not a silent route.
