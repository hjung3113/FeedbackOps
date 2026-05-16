# Single Workflow Template and Task Status enum in MVP

FeedbackOps spans multiple Managed Systems (Tableau, Power BI, Looker, etc.) but MVP uses **one shared Workflow Template** across all of them rather than per-Managed-System customization. The canonical **Task Status** enum is fixed at `Backlog → Todo → Doing → Review → Done → Released` and lives in `docs/design/06-task-project-system.md`; CONTEXT.md must reference it, not redeclare it.

We chose this because per-Managed-System workflow customization triples the surface area of permissions, audit, defaulting, and Reporter-Facing VOC Status mapping, and we have no MVP signal that any Managed System needs a different status set. Locking the enum also lets Reporter Summary, Dashboard counters, and entity-link relation types like `task_validated_by_survey` assume a single state machine.

Reopening this means either adding a per-Managed-System Workflow override (the dedicated **Managed System Workflow** glossary entry exists for that future) or adding new states to the shared enum — both are explicit, audited changes that should land as new ADRs rather than silent edits.
