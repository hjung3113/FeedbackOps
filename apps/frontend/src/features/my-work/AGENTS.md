# My Work Feature Agent Guide

## Ownership

My Work owns actor-centered queues across assigned VOC triage, Task Requests, Tasks, Surveys, and review actions.

It composes backend-provided summaries; it does not own VOC, Task Request, Task, Survey, Finding, Permission, Entity Link, or domain lifecycle rules.

## Route Boundary

- Owns `/my-work`.
- May link to selected detail routes in VOC, Tasks, Surveys, and Integration.
- Must preserve source-system route state when opening detail panels.

## Rules

- Backend permissions are authoritative; Role Level labels are display hints only.
- Linked context must use approved summaries from backend responses.
- Keep queues compact, list-first, and action-oriented.
- Do not create per-Managed-System route trees; use Managed System filters and defaults.

## Verification

- Test assigned-work filtering, permission-limited linked context, route restore, and cross-system pending/error states when touched.
