# Tasks Module Agent Guide

## Ownership

Task owns Task Request, Task, Milestone, internal task status, and execution read models.

Task Requests are implemented as a separate top-level module directory (`../task-requests/`) but logically owned by Task for boundary/permission purposes.

Managed System Registry belongs to Core. Task may consume Managed System scope and defaults, but must not own Managed System lifecycle. Future Work Initiative / Project grouping may live with Task only after MVP if needed.

## Invariants

- Released Task creates a reporter-facing review candidate when required; it does not automatically resolve VOC.
- Source evidence must remain visible or safely summarized in task detail.
- Standalone Tasks are valid and do not require source evidence, Finding, VOC, or Survey links.
- Task progress notes are the append-only `task.task_comments` timeline in `docs/adr/0049-finding-task-progress-notes.md`. Both `GET` and `POST /tasks/:id/comments` require Admin or Developer with `finding.manage`. Finding's read gate is not this one.

## Cross-System Rules

- Task creation from a reviewed Task Request must record entity links and audit events.
- Task repositories write only Task-owned tables.
- Reporter-facing updates are requested through VOC-owned APIs, not direct Task writes.
- Managed System filters refine Task and Task Request lists; they do not create per-Managed-System route or module trees.

## Verification

- Test request approval, conversion, release review candidates, reopened flows, and source evidence visibility when touched.

## Close-out contract (ADR-0067; implemented)

- ADR-0067 accepts Task Request assigned-reviewer Actor/team fields distinct
  from actual `reviewer_actor_id`, plus Task `assignee_team_id`. Default changes never reassign.
- Task Request reviewer default precedes eligible owner/AA team/scoped queue; conversion uses
  owner defaults. Invalid explicit rejects, invalid automatic skips, authorized null opts out.
- Preserve pending/Backlog, open authorized review and self-approval checks, links/audit/replay;
  notify only a concrete assignee once. Personal reviewer filters never narrow operational totals.
- Source mutations use the injected Dashboard recorder, not direct projection/source rewrites.

## Survey source defaults (ADR-0064; #739/#740 shipped)

Survey-derived Finding/source summaries and Task Request draft defaults contain
metadata only since the cutover. Approved text requires a fresh authorized highlight
projection, never a cached summary or private response/link/audit reconstruction.
Preserve ordinary source permissions and authored Task/Task Request prose; no
bulk history rewrite is authorized. Consume the existing owning-module seams.
