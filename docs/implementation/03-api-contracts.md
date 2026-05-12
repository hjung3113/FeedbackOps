# API Contracts

## Purpose

This document is the implementation-facing API contract.
`docs/design/14-api-draft.md` is design input only where not restated here.

Detailed endpoint schemas may later move into OpenAPI, but this document remains the behavioral contract.

## Global API Rules

```text
- All workspace-scoped endpoints validate workspace context.
- All mutating endpoints check permission before writing.
- Cross-system creation endpoints preserve source context.
- Cross-system creation endpoints create required entity_links in the same application transaction when possible.
- Sensitive decisions emit audit events.
- APIs must not expose Survey Response -> Create VOC.
- APIs must not expose generated_voc relation_type.
```

## Standard Error Codes

```text
validation_failed
unauthorized
permission_denied
not_found
workspace_mismatch
conflict
invalid_transition
link_visibility_denied
link_creation_failed
audit_write_failed
```

## Endpoint Contract Template

Each endpoint must define:

```text
- requirement_id
- method and path
- request body
- response body
- auth and permission
- validation errors
- side effects
- audit events
- entity_links created or updated
- dashboard queues affected
- idempotency behavior
```

## Cross-System Endpoint Decisions

These decisions pin the MVP endpoints that are easiest for implementation
agents to misread. Detailed relation semantics live in
`docs/design/11-entity-linking.md`.

Source-shaped routes may exist for clarity and discoverability. The source
module may host request parsing for routes such as
`POST /vocs/:id/create-finding`, but it must not write target-owned tables
directly. Target writes must run through the target module's application command
or an approved cross-system orchestration service that also writes links, audit
events, and dashboard repair signals.

| Endpoint | Requirement | Source | Target | Relation Type | Audit Event | Dashboard Effect | Forbidden Alternative |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /vocs/:id/create-finding` | FOP-FIND-001 | VOC | Finding | `created_finding` | finding_created_from_voc | removes missing-finding action for source VOC | creating Task directly without Finding |
| `POST /voc-clusters/:id/create-finding` | FOP-FIND-001 | VOC Cluster | Finding | `created_finding` | finding_created_from_voc_cluster | removes missing-finding action for cluster | creating generated VOCs |
| `POST /survey-responses/:id/create-finding` | FOP-SURVEY-005 | Survey Response | Finding | `generated_finding` | finding_created_from_survey_response | removes missing-finding action for survey response | `POST /survey-responses/:id/create-voc` |
| `POST /findings/:id/request-task` | FOP-TASK-001 | Finding | Task Request | `requested_task` | task_request_created_from_finding | moves Finding to pending execution review | creating Task without review when review is required |
| `POST /findings/:id/create-task` | FOP-FIND-003 | Finding | Task | `created_task` | task_created_from_finding | removes missing-task action for Finding | silently resolving reporter-facing VOC status |
| `POST /findings/:id/create-milestone` | FOP-FIND-003 | Finding | Milestone | `created_milestone` | milestone_created_from_finding | removes missing-execution action for Finding | using milestone as evidence source |
| `POST /survey-findings/:id/request-task` | FOP-SURVEY-005 | Finding | Task Request | `requested_task` | task_request_created_from_survey_finding | moves survey-derived Finding to pending execution review | Survey Response creates VOC |
| `POST /permission-requests/:id/approve` | FOP-PERM-002 | Permission Request | Permission Grant | none | permission_request_approved | may restore blocked object visibility | bypassing explicit deny checks |
| `POST /permission-requests/:id/reject` | FOP-PERM-002 | Permission Request | Permission Deny | none | permission_request_rejected | keeps or creates permission-blocked state | exposing full restricted object |

## Required MVP Endpoints

### VOC

```text
POST /vocs
GET /vocs
GET /vocs/:id
PATCH /vocs/:id
POST /vocs/:id/create-finding
POST /vocs/:id/request-task
POST /vocs/:id/public-updates
```

### VOC Cluster

```text
POST /voc-clusters
GET /voc-clusters
GET /voc-clusters/:id
PATCH /voc-clusters/:id
POST /voc-clusters/:id/create-finding
```

### Finding

```text
POST /findings
GET /findings
GET /findings/:id
PATCH /findings/:id
POST /findings/:id/evidence-highlights
POST /findings/:id/link-evidence
POST /findings/:id/request-task
POST /findings/:id/create-task
POST /findings/:id/create-milestone
POST /findings/:id/link-task
POST /findings/:id/link-milestone
```

### Task / Project

```text
POST /task-requests
GET /task-requests
GET /task-requests/:id
POST /task-requests/:id/approve
POST /task-requests/:id/reject
POST /task-requests/:id/request-more-evidence
POST /task-requests/:id/convert-to-task
POST /task-requests/:id/link-existing-task

GET /tasks
GET /tasks/:id
POST /tasks
PATCH /tasks/:id
```

### Survey

```text
POST /surveys
GET /surveys
GET /surveys/:id
POST /surveys/:id/responses
GET /surveys/:id/results
POST /survey-responses/:id/create-finding
POST /survey-findings/:id/request-task
POST /survey-findings/:id/create-task
POST /survey-findings/:id/create-milestone
POST /survey-findings/:id/link-task
POST /survey-findings/:id/link-milestone
```

### Core / Product Area

```text
GET /product-areas
POST /product-areas
PATCH /product-areas/:id
POST /product-areas/:id/archive
```

### Permission

```text
POST /permission-requests
GET /permission-requests
POST /permission-requests/:id/approve
POST /permission-requests/:id/reject
POST /permission-requests/:id/revoke
```

### Entity Links

```text
POST /entity-links
GET /entity-links
PATCH /entity-links/:id
DELETE /entity-links/:id
```

## Forbidden Endpoint

```text
POST /survey-responses/:id/create-voc
```

If compatibility handling is ever needed, return `404` or `410`. Never create a VOC or `generated_voc` link from a Survey Response.
