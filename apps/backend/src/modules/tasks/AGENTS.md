# Tasks Module Agent Guide

## Ownership

Task owns Task Request, Task, Milestone, internal task status, and execution read models.

Task Requests are implemented as a separate top-level module directory (`../task-requests/`) but logically owned by Task for boundary/permission purposes.

Managed System Registry belongs to Core. Task may consume Managed System scope and defaults, but must not own Managed System lifecycle. Future Work Initiative / Project grouping may live with Task only after MVP if needed.

## Invariants

- Task Request protects the backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate.
- Released Task creates a reporter-facing review candidate when required; it does not automatically resolve VOC.
- Source evidence must remain visible or safely summarized in task detail.
- Standalone Tasks are valid and do not require source evidence, Finding, VOC, or Survey links.

## Cross-System Rules

- Task creation from a reviewed Task Request must record entity links and audit events.
- Task repositories write only Task-owned tables.
- Reporter-facing updates are requested through VOC-owned APIs, not direct Task writes.
- Managed System filters refine Task and Task Request lists; they do not create per-Managed-System route or module trees.

## Verification

- Test request approval, conversion, release review candidates, reopened flows, and source evidence visibility when touched.
