# ADR-0049: Finding and Task progress notes

Date: 2026-09-24

## Status

Accepted

## Context

Issue #377 shipped an append-only internal timeline on Finding and on Task.
The product name in the UI is progress notes: the Finding panel titles it
`진행 메모`, the Task panel titles it `Progress notes`. The stored rows are
`finding.finding_comments` and `task.task_comments`, created by
`apps/backend/migrations/0048_finding_task_comments.sql`.

Until this ADR, the only maintained mention of those tables was the schema
inventory in `docs/implementation/04-database-and-migrations.md`. Design docs
call the same idea "internal comments" and say a Reporter or default User
cannot read them. They do not name the endpoints, the two row kinds, or the
fact that Finding and Task do not use the same read gate.

VOC Internal Comment (`voc.voc_internal_comments`, the VOC conversation
timeline) is a different surface. Progress notes do not write it, and the
Finding/Task panels do not render `ConversationTimeline`.

## Decision

Progress notes are per-entity comment rows owned by the Finding module and
the Task module. There is no shared comments table and no third entity.

**Row shape.** Both tables store `id`, `workspace_id`, the parent id
(`finding_id` or `task_id`), `actor_id`, `kind`, `from_status`, `to_status`,
`body_rich_content`, and `created_at`. `kind` is `note` or `status_change`.
A `note` has both status columns null. A `status_change` has both status
columns set to a value of that entity's status vocabulary. Parent delete
cascades. The list index is `(parent id, created_at DESC, id DESC)`.

**Append-only.** `fops_app` has `SELECT` and `INSERT` only. `UPDATE`,
`DELETE`, and `TRUNCATE` are revoked. There is no edit or delete endpoint.
`fops_migrate` retains full grants.

**Who writes a row.**

- `POST /findings/:id/comments` and `POST /tasks/:id/comments` insert `kind:
  note` only. The client does not choose `kind`. Body is TipTap, sanitized
  with the `internal-comment` surface. `attachmentRef` nodes are rejected.
  `mentions` must be the exact set of `mention` node `actor_id`s in the body,
  each an Actor in the same workspace, at most 50.
- A successful Finding or Task status change inserts one `status_change` in
  the same transaction as the status update and its status-change audit.
  Optional `reason` becomes the body; a transition with no reason stores a
  blank document. A same-status no-op writes neither the comment nor the
  audit.

**Read.** `GET /findings/:id/comments` and `GET /tasks/:id/comments` return
newest-first pages. The cursor is base64 JSON `{ createdAt, id }` taken from
the raw Postgres timestamp, not a millisecond `Date`, so two rows in the same
millisecond both survive the next page. Default limit 50, maximum 100.

The read gates are not the same:

- Finding: `canReadFinding`, which is `checkFindingRead` with
  `requireElevatedRole: true`. Admin, or a Developer with `finding.read` on
  the Finding's Managed System. A User is denied before grants are consulted.
  Missing Finding is `404 not_found.record`. An existing Finding the actor
  cannot read is `403 permission.denied`.
- Task: `checkFindingManage` with `requireElevatedRole: true`. Admin, or a
  Developer with `finding.manage` on the Task's Managed System. `finding.read`
  is not enough. A User is denied before the Task is loaded, so a missing
  Task is still `403 permission.denied` for a non-elevated actor. For an
  Admin or Developer, a missing Task is `404 not_found.record`. An existing
  Task the actor cannot manage is `403 permission.denied`. The shared panel
  treats that 403 the same way it treats the Finding 403: the section stays
  visible and shows a permission-blocked panel.

**Write gates** are also not the same:

- Finding: `canManageFinding`, which is `checkFindingManage` with
  `requireElevatedRole: false`. An explicit `finding.manage` grant is enough,
  including for a User.
- Task: the actor must already be Admin or Developer
  (`hasElevatedFindingRole`), and `checkFindingManage` with
  `requireElevatedRole: true` must allow. A User is denied before the grant
  is consulted.

An archived parent Managed System still allows GET. POST returns
`409 conflict.parent_archived`.

**Audit.** A `note` writes `finding_comment_created` or
`task_comment_created` (subject is the Finding or Task; detail carries the
comment id, actor id, and mention ids). A `status_change` does not write
those events. It is covered by the existing `finding_status_changed` or
`task_status_changed` row in the same transaction.

**HTTP and UI** are specified in
`docs/implementation/api/findings.md` (Progress notes) and
`docs/implementation/api/tasks.md` (Progress notes), indexed from
`docs/implementation/03-api-contracts.md`, and in the Finding and Task design
docs. Shared DTOs live in `packages/shared/src/findings/comments.ts`
and `packages/shared/src/tasks/comments.ts`. The screen is
`apps/frontend/src/features/cross-system/progress-notes/`. Its resource union
is `{ kind: 'finding' | 'task'; id }`. The client posts notes only. It
flattens all loaded newest-first pages, then reverses the combined list into
chronological order, so older pages appear above newer entries. It treats a
`403` on the list as a permission-blocked panel rather than hiding the
section. The composer is a display hint; the backend remains authoritative.

## Alternatives rejected

### One shared comments table

Finding and Task statuses, parent foreign keys, and read gates differ. The
migration creates two tables with the same column shape and different status
checks. A shared table would hide that split.

### Reuse the VOC conversation timeline

VOC Internal Comment is public/internal-tabbed and uses VOC kind labels.
Progress notes carry a `status_change` from-to pair that those entries do not.
The Finding and Task panels mount `ProgressNotesSection` instead.

## Consequences

- Reporter-facing surfaces do not render these rows. Design text that says a
  Reporter or default User cannot read Task internal comments is this timeline.
- A Developer who can read a Finding cannot assume they can read its Task's
  progress notes. Task reads require `finding.manage`.
- A User with an explicit `finding.manage` grant can post a Finding note and
  still cannot post a Task note.
- History remains readable after the parent Managed System is archived. New
  notes do not.
- Idempotent replay of a note POST returns the stored `201`. The hash is the
  raw body plus the parent id and the route identity `finding.comment` or
  `task.comment`. A reused key with a different hash is
  `409 conflict.idempotency_key_reuse`.

## Reopening

Adding another entity on this same per-module shape is not a reopen. Give it
its own comments table and grants, GET and POST on that module's routes, a
shared DTO, an audit event for `note`, a `status_change` insert on its status
command, and a member of `ProgressNotesResource`. Collapsing the tables,
making a row editable, accepting `kind` from the client, or showing progress
notes on a reporter-facing summary each warrants a new ADR.

## Worked example — Task beside Finding

Finding shipped first in the same migration. Task is the copy, and it is not
a pure copy. It kept the table shape, the `note` / `status_change` pair, the
append-only grants, the cursor, the mention rule, and the audit-on-note rule.
It changed the read gate from `finding.read` to `finding.manage`, and it
refuses a non-elevated role before opening the write transaction. A further
entity chooses its gate explicitly. Omitting that choice does not inherit
Finding's read gate.
