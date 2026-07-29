# API Draft

## Purpose

This document lists draft API changes and constraints. It is not a final OpenAPI spec.

## Removed API

```text
POST /survey-responses/:id/create-voc
```

Reason:

```text
Survey Response must not create VOC. Survey results create Findings or Evidence Highlights.
```

Expected behavior:

```text
- New implementation should not register this route.
- If compatibility handling is needed, return 404 or 410.
- Do not create generated_voc entity link.
```

## Survey APIs

```text
POST /survey-responses/:id/create-finding
POST /survey-findings/:id/request-task
POST /survey-findings/:id/link-task
# future: POST /survey-findings/:id/create-milestone
# future: POST /survey-findings/:id/link-milestone
```

## VOC APIs

```text
POST /vocs/:id/create-finding
POST /voc-clusters/:id/create-finding
```

## Finding APIs

```text
GET   /findings/:id
PATCH /findings/:id
POST /findings/:id/request-task
POST /findings/:id/link-task
# future: POST /findings/:id/create-milestone
```

Recommended additions:

```text
POST /findings/:id/evidence-highlights
POST /findings/:id/link-evidence
# future: POST /findings/:id/link-milestone
```

`PATCH /findings/:id` accepts strict body `{ status, reason? }` and returns the
updated Finding DTO. Slice 6 allows only `draft -> active`,
`draft -> not_actionable`, `active -> not_actionable`, and
`not_actionable -> active`; `converted` and `archived` are rejected as
user-directed targets in this endpoint. Authz reuses `finding.manage`; successful
non-no-op transitions audit `finding_status_changed`.

## Analytics Area APIs

```text
GET  /analytics-areas
POST /analytics-areas
PATCH /analytics-areas/:id
POST /analytics-areas/:id/archive
```

## Permission Request APIs

```text
POST /permission-requests
GET  /permission-requests
POST /permission-requests/:id/approve
POST /permission-requests/:id/reject
POST /permission-requests/:id/revoke
```

## Entity Link APIs

Recommended additions:

```text
POST /entity-links
GET  /entity-links
PATCH /entity-links/:id
DELETE /entity-links/:id
```

## API Design Rules

```text
- Cross-system creation APIs must preserve source context.
- APIs that create Task Request or link an existing Task from Finding must create entity_links.
- APIs that expose linked objects must enforce visibility.
- APIs must not expose generated_voc relation type.
- Sensitive decisions must emit audit log events.
```

## Endpoint Contract Template

Future API specs should expand each endpoint with:

```text
- requirement_id
- request body
- response body
- auth / permission
- validation errors
- side effects
- audit events
- entity_links created
- dashboard queues affected
- idempotency behavior
```

## AI Implementation Notes

Before adding an endpoint, confirm:

```text
1. Which system owns the source object?
2. Which system owns the target object?
3. Which entity_link relation_type is created?
4. What visibility should the link have?
5. What permission is required?
6. What audit event is required?
7. Which Dashboard missing-link queue should be affected?
```
