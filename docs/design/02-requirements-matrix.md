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
| FOP-CORE-002 | Product Area Tree | MVP | Core | FOP-CORE-001 | `01-domain-model.md`, `03-core-platform.md`, `15-data-contracts.md` |
| FOP-CORE-003 | Audit Log Baseline | MVP | Core | FOP-CORE-001 | `03-core-platform.md`, `09-permission-access.md` |
| FOP-VOC-001 | Create VOC | MVP | VOC | FOP-CORE-001 | `04-voc-system.md` |
| FOP-VOC-002 | Manage VOC Inbox | MVP | VOC | FOP-VOC-001 | `04-voc-system.md`, `12-ui-ux-principles.md` |
| FOP-VOC-003 | VOC Cluster | MVP | VOC | FOP-VOC-001 | `04-voc-system.md`, `10-cross-system-workflows.md` |
| FOP-VOC-004 | Similar VOC Recommendation | SHOULD | VOC | FOP-VOC-003 | `04-voc-system.md` |
| FOP-VOC-005 | Public Update | MVP | VOC | FOP-VOC-001, FOP-TASK-003 | `04-voc-system.md`, `10-cross-system-workflows.md` |
| FOP-FIND-001 | Create Finding | MVP | Finding | FOP-LINK-001 | `05-finding-insight-system.md` |
| FOP-FIND-002 | Manage Evidence Highlights | MVP | Finding | FOP-FIND-001 | `01-domain-model.md`, `05-finding-insight-system.md`, `15-data-contracts.md` |
| FOP-FIND-003 | Convert Finding To Execution Candidate | MVP | Finding | FOP-TASK-001 | `05-finding-insight-system.md`, `06-task-project-system.md` |
| FOP-TASK-001 | Create Task Request | MVP | Task / Project | FOP-FIND-001 | `06-task-project-system.md` |
| FOP-TASK-002 | Approve Task Request | MVP | Task / Project | FOP-TASK-001, FOP-PERM-001 | `06-task-project-system.md`, `09-permission-access.md` |
| FOP-TASK-003 | Manage Task | MVP | Task / Project | FOP-TASK-002 | `06-task-project-system.md` |
| FOP-TASK-004 | Manage Milestone | SHOULD | Task / Project | FOP-FIND-003 | `06-task-project-system.md` |
| FOP-SURVEY-001 | Create Survey | MVP | Survey | FOP-CORE-001 | `07-survey-system.md` |
| FOP-SURVEY-002 | Basic Builder | MVP | Survey | FOP-SURVEY-001 | `07-survey-system.md` |
| FOP-SURVEY-003 | Store Responses | MVP | Survey | FOP-SURVEY-001 | `07-survey-system.md` |
| FOP-SURVEY-004 | Analyze Results | MVP | Survey | FOP-SURVEY-003 | `07-survey-system.md` |
| FOP-SURVEY-005 | Convert Result To Action | MVP | Survey | FOP-FIND-001, FOP-TASK-001 | `07-survey-system.md`, `10-cross-system-workflows.md` |
| FOP-DASH-001 | Show Action Queues | MVP | Dashboard | FOP-LINK-003 | `08-dashboard-system.md` |
| FOP-DASH-002 | Show Product Area Breakdowns | MVP | Dashboard | FOP-CORE-002 | `08-dashboard-system.md` |
| FOP-DASH-003 | Show Coverage | SHOULD | Dashboard | FOP-LINK-003 | `08-dashboard-system.md` |
| FOP-PERM-001 | Request Permission | MVP | Permission / Access | FOP-CORE-001 | `09-permission-access.md` |
| FOP-PERM-002 | Decide Permission Request | MVP | Permission / Access | FOP-PERM-001, FOP-CORE-003 | `09-permission-access.md` |
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
| FOP-OUT-003 | Product Area forced-syncs with real menus/routes/code modules | OUT | Product Area remains internal context |
| FOP-OUT-004 | Full automatic clustering in MVP | OUT | Similarity recommendation plus manager confirmation |
| FOP-OUT-005 | Jira-style custom workflow builder in MVP | OUT | Fixed simple Task and VOC statuses |

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
