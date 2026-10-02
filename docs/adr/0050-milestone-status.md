# ADR-0050: Milestone status

Date: 2026-09-27

## Status

Accepted

## Context

Issue #514 introduces `task.milestones`. Design
`docs/superpowers/specs/2026-09-26-milestone-domain-design.md` §7 item 2
proposes the persisted labels `planning | in_progress | blocked | released`,
default `planning`, and an authorized PATCH that may move among those labels.
That item is explicitly a proposal, not a spec. The same design says the
status enum, if locked, is recorded where this repo records decisions
(design line 513). No earlier ADR names those four labels.

Two questions were left open and are decided here, not by an implementer:

- §7 item 17: may a Milestone be `released` while child Tasks are not, and
  is PATCH otherwise free among the persisted set?
- §7 item 18: may a Task be assigned to an already-`released` Milestone?

The column already exists with default `'planning'` and no CHECK
(`0049_milestone_domain`). Client `status` is rejected on create and on
PATCH until this ADR is applied. Managed System immutability is unchanged
and is not reopened here.

The Tasks-section column call (§7 item 12) is not a status rule. It is
recorded only so the later screen node does not choose it: show the Task
`due_date` in the slot where `screen-milestones.jsx` `MilestoneTaskRow`
shows `estimate`. Do not add an `estimate` field.

## Decision

1. The persisted Milestone status set is exactly `planning`, `in_progress`,
   `blocked`, and `released`. No other value is valid. `blocked` is stored
   so the badge can render. It is not a list tab. There is no workflow
   builder and no extra state.

2. The column default stays `planning`. A database CHECK names the four
   values. Application validation uses the same set.

3. Create accepts an optional `status` in that set and stores it. Omitting
   `status` stores `planning`. A value outside the set is
   `validation.failed` and writes no row.

4. PATCH may set `status` to any value in the set, including a change from
   the current value to any other value in the set. Release does not depend
   on child Tasks: `planning` → `released` with zero child Tasks succeeds.
   A title-only PATCH does not write `from_status` / `to_status`. A status
   change writes `milestone_updated` with both. A value outside the set is
   `validation.failed` and leaves the row unchanged.

5. Assigning or unassigning a Task does not consult Milestone status. A
   `released` Milestone in the caller's workspace on the Task's Managed
   System is a successful assign. Existence, workspace, and Managed System
   checks stay. Convert does not grow a status policy either: a `released`
   Milestone remains acceptable there for the same reason. No new convert
   test is required by this ADR.

6. `primary_managed_system_id` and `managed_system_id` stay rejected on
   PATCH and are not written.

## Consequences

- The follow-up migration adds the CHECK. It does not edit `0049`.
- Shared create and PATCH schemas accept `status` only inside the set.
- Tests quote this ADR. They do not restate design §7 as if it were still
  a proposal, and they do not also assert the opposite outcome.
- Task `due_date` occupies the Milestone Tasks-section slot that the
  prototype labels `estimate`. That sentence does not change Task columns.
