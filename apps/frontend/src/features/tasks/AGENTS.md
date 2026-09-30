# Tasks Feature Agent Guide

## Ownership

Tasks owns frontend route composition for Task Requests, Tasks, Milestones, Managed System-scoped task views, backlog, board, and task detail panels. Work Initiative grouping is future work and has no route yet.

It does not own reporter-facing VOC status or source evidence visibility rules.

## Route Boundary

- Owns `/tasks`, a single view-switching route (`?view=requests|backlog|board|my|inbox|milestones`; see `apps/frontend/src/routes/_authed/tasks.tsx`). There is no `/tasks/initiatives` route.
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

## Key files

- `apps/frontend/src/routes/_authed/tasks.tsx` — selects the Task view from URL state.
- `apps/frontend/src/features/tasks/routes/TaskListRoute.tsx` — backlog list, filters, and selected detail.
- `apps/frontend/src/features/tasks/routes/TaskBoardRoute.tsx` — Task board columns and grouping state.
- `apps/frontend/src/features/tasks/routes/TaskRequestsRoute.tsx` — Task Request queue and selected detail.
- `apps/frontend/src/features/tasks/routes/MilestonesRoute.tsx` — Milestone status tabs and list-state branches.
- `apps/frontend/src/features/tasks/routes/task-requests/TaskRequestPanel.tsx` — Task Request detail and conversion actions.
- `apps/frontend/src/features/tasks/components/TaskDetailPanel.tsx` — Task detail and status actions.
- `apps/frontend/src/features/tasks/components/MilestoneRow.tsx` — Milestone list row.
- `apps/frontend/src/features/tasks/components/MilestoneDetailPanel.tsx` — Milestone detail and editing panels.
- `apps/frontend/src/features/tasks/components/MilestoneStatusBadge.tsx` — Milestone status labels and badge styles.
- `packages/ui/src/badges/InternalTaskBadge.tsx` — shared internal Task status labels and badge styles.
- `apps/frontend/src/lib/copy/permission-reasons.ts` — shared blocked copy for Task and Milestone views.

## Verification

- Test Task Request review flows, backlog/board selected detail restore, Managed System filters, linked evidence summaries, and reporter-facing status review candidates when touched.
