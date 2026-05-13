# Tasks Feature Agent Guide

## Ownership

Tasks owns frontend route composition for Task Requests, Tasks, Managed System-scoped task views, Work Initiatives, backlog, board, and task detail panels.

It does not own reporter-facing VOC status or source evidence visibility rules.

## Route Boundary

- Owns `/tasks` and `/tasks/initiatives`.
- Task Requests are Tasks intake routes, not top-level routes.
- Managed Systems are scope/defaulting surfaces; they do not create per-Managed-System route trees.

## Invariants

- Task Request protects the backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate.
- Released work creates a reporter-facing review candidate when required; it does not automatically resolve VOC.
- Standalone Tasks are valid and do not require source evidence.
- Task Board is execution work only; VOC owner assignment is not Task assignee/kanban assignment.
- Task Request review may be Admin or same Managed System Developer; self-approval is allowed and audited.

## Rules

- Use compact Linear-style list/detail and board behavior.
- Show evidence/source panels only when linked context exists and is visible or safely summarized.
- Managed System filters refine lists and defaults; they do not duplicate VOC, Survey, Task, or Integration navigation.
- Task creation from Finding must preserve pending, error, and linked context states.

## Verification

- Test Task Request review flows, backlog/board selected detail restore, Managed System filters, linked evidence summaries, and reporter-facing status review candidates when touched.
