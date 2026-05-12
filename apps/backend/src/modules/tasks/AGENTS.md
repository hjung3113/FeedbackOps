# Tasks Module Agent Guide

## Ownership

Task / Project owns Task Request, Task, Project, Milestone, internal task status, and execution read models.

## Invariants

- Task Request protects the backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate.
- Released Task creates a reporter-facing review candidate when required; it does not automatically resolve VOC.
- Source evidence must remain visible or safely summarized in task detail.

## Cross-System Rules

- Task creation from Finding must record entity links and audit events.
- Task repositories write only Task / Project owned tables.
- Reporter-facing updates are requested through VOC-owned APIs, not direct Task writes.

## Verification

- Test request approval, conversion, release review candidates, reopened flows, and source evidence visibility when touched.
