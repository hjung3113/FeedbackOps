# Requirements Matrix

## Purpose

This matrix gives AI implementation agents stable requirement IDs and traceability.

Detailed behavior lives in system documents. This file is the index for scope, dependencies, and implementation ownership.

## Status Values

```text
MVP: build in the first implementation target
SHOULD: include if cheap and directly supports MVP flow
LATER: Phase 1 or Phase 2
OUT: explicitly excluded
```

## Requirement Index

| ID | Title | Status | Owner | Depends On | Primary Docs |
| --- | --- | --- | --- | --- | --- |
| FOP-CORE-001 | Workspace Context | MVP | Core | none | `03-core-platform.md` |
| FOP-CORE-002 | Managed System Registry And Defaults | MVP | Core | FOP-CORE-001 | `03-core-platform.md`, `09-permission-access.md` |
| FOP-CORE-003 | Analytics Area Catalog | MVP | Core | FOP-CORE-001 | `01-domain-model.md`, `03-core-platform.md`, `15-data-contracts.md` |
| FOP-CORE-004 | Audit Log Baseline | MVP | Core | FOP-CORE-001 | `03-core-platform.md`, `09-permission-access.md` |
| FOP-VOC-001 | Create VOC | MVP | VOC | FOP-CORE-001 | `04-voc-system.md` |
| FOP-VOC-002 | Manage VOC Triage | MVP | VOC | FOP-VOC-001, FOP-CORE-002 | `04-voc-system.md`, `12-ui-ux-principles.md` |
| FOP-VOC-003 | VOC Cluster | MVP | VOC | FOP-VOC-001 | `04-voc-system.md`, `10-cross-system-workflows.md` |
| FOP-VOC-004 | Similar VOC Recommendation | SHOULD | VOC | FOP-VOC-003 | `04-voc-system.md` |
| FOP-VOC-005 | Public Update | MVP | VOC | FOP-VOC-001 | `04-voc-system.md`, `10-cross-system-workflows.md` |
| FOP-FIND-001 | Create Finding | MVP | Finding | FOP-LINK-001 | `05-finding-insight-system.md` |
| FOP-FIND-002 | Manage Evidence Highlights | MVP | Finding | FOP-FIND-001 | `01-domain-model.md`, `05-finding-insight-system.md`, `15-data-contracts.md` |
| FOP-FIND-003 | Convert Finding To Execution Candidate | SHOULD | Finding | FOP-FIND-001, FOP-TASK-001 | `05-finding-insight-system.md`, `06-task-project-system.md` |
| FOP-TASK-001 | Create Task Request | MVP | Task | FOP-CORE-001 | `06-task-project-system.md` |
| FOP-TASK-002 | Approve Task Request | MVP | Task | FOP-TASK-001, FOP-PERM-001 | `06-task-project-system.md`, `09-permission-access.md` |
| FOP-TASK-003 | Manage Task | MVP | Task | FOP-TASK-002 | `06-task-project-system.md` |
| FOP-TASK-004 | Manage Task Milestone | SHOULD | Task | FOP-TASK-003 | `06-task-project-system.md` |
| FOP-SURVEY-001 | Create Survey | MVP | Survey | FOP-CORE-001 | `07-survey-system.md` |
| FOP-SURVEY-002 | Basic Builder | MVP | Survey | FOP-SURVEY-001 | `07-survey-system.md` |
| FOP-SURVEY-003 | Store Responses | MVP | Survey | FOP-SURVEY-001 | `07-survey-system.md` |
| FOP-SURVEY-004 | Analyze Results | MVP | Survey | FOP-SURVEY-003 | `07-survey-system.md` |
| FOP-SURVEY-005 | Convert Result To Action | SHOULD | Survey | FOP-LINK-001, optional FOP-FIND-001 / FOP-TASK-001 | `07-survey-system.md`, `10-cross-system-workflows.md` |
| FOP-DASH-001 | Show Action Queues | MVP | Dashboard | FOP-CORE-001, optional FOP-LINK-003 | `08-dashboard-system.md` |
| FOP-DASH-002 | Show Managed System And Analytics Area Breakdowns | MVP | Dashboard | FOP-CORE-002, FOP-CORE-003 | `08-dashboard-system.md` |
| FOP-DASH-003 | Show Coverage | SHOULD | Dashboard | FOP-LINK-003 | `08-dashboard-system.md` |
| FOP-PERM-001 | Request Permission | MVP | Permission / Access | FOP-CORE-001 | `09-permission-access.md` |
| FOP-PERM-002 | Decide Permission Request | MVP | Permission / Access | FOP-PERM-001, FOP-CORE-004 | `09-permission-access.md` |
| FOP-PERM-003 | Enforce Explicit Deny | MVP | Permission / Access | FOP-PERM-002 | `09-permission-access.md`, `11-entity-linking.md` |
| FOP-X-001 | Preserve Source Context | MVP | Cross-System | FOP-LINK-001 | `10-cross-system-workflows.md` |
| FOP-X-002 | Prevent Invalid Conversions | MVP | Cross-System | FOP-SURVEY-003 | `10-cross-system-workflows.md`, `14-api-draft.md` |
| FOP-X-003 | Next Action Continuity | MVP | Cross-System | FOP-X-001 | `10-cross-system-workflows.md`, `12-ui-ux-principles.md` |
| FOP-LINK-001 | Create Entity Link | MVP | Entity Linking | FOP-CORE-001 | `11-entity-linking.md` |
| FOP-LINK-002 | Enforce Visibility | MVP | Entity Linking | FOP-PERM-003 | `11-entity-linking.md` |
| FOP-LINK-003 | Support Dashboard Missing-Link Queries | MVP | Entity Linking | FOP-LINK-001 | `11-entity-linking.md`, `08-dashboard-system.md` |

## Forbidden Requirements

| ID | Behavior | Status | Replacement |
| --- | --- | --- | --- |
| FOP-OUT-001 | Survey Response creates VOC | OUT | Survey Response creates Finding or Evidence Highlight |
| FOP-OUT-002 | Task Done automatically resolves Reporter-facing VOC Status | OUT | Released triggers status review |
| FOP-OUT-003 | Analytics Area automatically syncs with real menus/routes/code modules in MVP | OUT | Analytics Area is managed manually as analytics menu context |
| FOP-OUT-004 | Full automatic clustering in MVP | OUT | Similarity recommendation plus authorized confirmation |
| FOP-OUT-005 | Jira-style custom workflow builder in MVP | OUT | Fixed simple Task and VOC statuses |
| FOP-OUT-006 | Requiring VOC, Survey, or Task to pass through Finding, Dashboard, Evidence, or Links | OUT | Systems complete local workflows independently; integration is optional and policy-driven |
| FOP-OUT-007 | Duplicating VOC, Survey, or Task navigation per Project | OUT | One system with Managed System scope, filters, and defaults |
| FOP-OUT-008 | External/customer-contact login in MVP | OUT | AD-authenticated internal Actors only |
| FOP-OUT-009 | Analytics Area as an MVP permission boundary | OUT | Role Level + Managed System scope |
| FOP-OUT-010 | VOC follow-up creates Task directly | OUT | VOC follow-up creates Task Request |
| FOP-OUT-011 | Per-Managed System custom workflows in MVP | OUT | Shared Workflow Template |
| FOP-OUT-012 | Markdown-only or raw-HTML rich input | OUT | WYSIWYG-first Rich Content Editor |
| FOP-OUT-013 | Work Initiative as required MVP execution grouping | OUT | Lightweight Task Milestone inside Task system |
| FOP-OUT-014 | Automatic Milestone Outcome Survey validation in MVP | OUT | Manual Task/Milestone follow-up; outcome validation is future cross-system workflow |
| FOP-OUT-015 | Real-time VOC chat with mentions, reactions, read receipts, or threaded replies | OUT | Append-only public and internal VOC timelines |
| FOP-OUT-016 | VOC Cluster merge or split in MVP | OUT | Manual cluster create, add/remove VOC membership, and confirm |

## Requirement Template For Future Additions

```text
### FOP-AREA-000: Title

Scope: MVP / SHOULD / LATER / OUT
Owner system:
Depends on:
API refs:
Data refs:
Permission refs:
Forbidden:

Acceptance criteria:
- Given ...
- When ...
- Then ...
```
