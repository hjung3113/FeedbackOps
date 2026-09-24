# Findings Module Agent Guide

## Ownership

Findings owns Finding records, evidence highlights, finding status, evidence-first detail read models, and execution handoff commands.

## Invariants

- Finding is the bridge from evidence to execution.
- Evidence source must remain traceable after conversion to Task Request, Task, or Milestone.
- A Finding can be not actionable; do not force every Finding into execution.
- Impact and confidence are decision inputs, not automatic priority engines.
- Finding progress notes are the append-only `finding.finding_comments` timeline in `docs/adr/0049-finding-task-progress-notes.md`. `GET /findings/:id/comments` is Admin, or a Developer with `finding.read` (`requireElevatedRole: true`; a User is denied before grants, even with `finding.read`). `POST` is `finding.manage` with `requireElevatedRole: false`, so an explicit grant is enough, including for a User. Task progress notes are not this module's table.

## Cross-System Rules

- Finding may request Task, create Task, or create Milestone only through application services that write required `entity_links`.
- Finding must preserve source previews for VOC and Survey evidence within permission limits.

## Verification

- Test evidence preservation, link creation, permission-limited summaries, and execution handoff errors when touched.
