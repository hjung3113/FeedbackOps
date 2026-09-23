# VOC

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## VOC

```text
POST /vocs
GET /vocs
GET /vocs/pre-submit-peers?managed_system_id=<uuid>
GET /vocs/:id
GET /vocs/:id/conversation
PATCH /vocs/:id
PATCH /vocs/:id/description
POST /vocs/:id/create-finding
POST /vocs/:id/request-task
POST /vocs/:id/public-updates
POST /vocs/:id/reporter-replies
POST /vocs/:id/internal-comments
```

## VOC Create And Conversation Contract

`POST /vocs` request body must include:

```text
managed_system_id required
title required
description rich content required
analytics_area_id optional
source_context optional enum: direct_use | proxy_report | operational_discovery | stakeholder_request
attachments optional attachment references
```

`title` must contain at least one character after trimming; the trimmed value is
stored. `description_rich_content` must contain non-whitespace content. Either
required-value violation returns `422 validation.failed`.

`POST /vocs` must not accept:

```text
reporter_id
severity
reporter_facing_status
task_status
```

Reporter is derived from the authenticated Actor. Severity is assigned during
triage by an authorized Admin or same-Managed-System Developer. The Reporter
may edit title, description, and attachments only before triage begins. After
triage begins, additional Reporter input must be captured through Reporter
Reply, not by mutating the original description.
MVP has no affected_user field; proxy-report context is captured in the VOC
description.
Any AD-authenticated Actor may call `POST /vocs` to create their own VOC
without a Permission Request. Permission checks still validate workspace
membership and that the selected Managed System is available for VOC submission,
but Task, Finding, Developer, or Admin permissions are not required to submit
VOC.

VOC conversation endpoints:

```text
POST /vocs/:id/public-updates
- Admin or Developer in the same Managed System Permission Scope only.
- Creates reporter-visible Public Update.

POST /vocs/:id/reporter-replies
- Reporter on their own VOC only.
- Creates reporter-visible Reporter Reply and may return Waiting Reporter VOCs to the follow-up queue.

POST /vocs/:id/internal-comments
- Admin or Developer in the same Managed System Permission Scope only.
- Creates private Internal Comment.
```

Conversation entries are append-only in MVP. The API does not expose general
edit/delete, mention, reaction, read receipt, or threaded reply behavior. Admin
moderation delete may be added later as an explicit audit-backed endpoint.

Public Update, Reporter Reply, Internal Comment, and VOC description fields use
rich content. Backend validation must sanitize/render safely, enforce
attachment visibility, reject base64 inline body images, and prevent external
image URLs from rendering inline.

VOC Cluster is not a reporter-visible object in MVP. Cluster-level bulk update
behavior may generate a candidate only; applying it creates separate Public
Update records for selected VOCs and does not automatically change
reporter_facing_status.

Reporter-facing VOC Status may be changed only by workspace Admin or Developer
within the same Managed System Permission Scope, through an explicit Public
Update flow or reporter-status review action. Task Done, Task Released,
Reporter Reply, and cluster bulk update candidates must not automatically
change reporter_facing_status. Status changes are per-VOC audited decisions and
should return whether a Public Update was created, skipped with reason, or still
recommended.

MVP APIs must not expose a direct bulk reporter_facing_status mutation. Bulk or
cluster endpoints may return status update candidates and shared draft content,
but apply requests must resolve into separate per-VOC status decisions, Public
Update records or skip reasons, and audit events.

VOC Cluster member detail projects `voc_id`, `added_by`, `added_at`, and the
optional enrichment fields `display_id`, `title`, `severity`, and
`reporter_facing_status`. Both rows and `member_count` use the same predicate:
Admin, `voc.read` on the member Managed System, or reporter ownership.
Triage-only effective scope is not member-read authority.

`DELETE /voc-clusters/:id/vocs/:voc_id` returns the identical
`not_found.record` 404 envelope when the VOC is unreadable, missing, or exists
but is not a member. A successful authorized removal returns 204 and records
the normal membership-removal audit event.

`POST /voc-clusters/:id/public-update-candidate` validates and returns shared
draft content after `finding.manage`; it writes no VOC. `POST
/voc-clusters/:id/apply-public-update-candidate` accepts selected `voc_ids` and
the Public Update request. Each readable selected member is delegated to the
existing per-VOC Public Update command in its own transaction, which rechecks
`voc.triage`, archive state, transition validity, sanitization, and audit.
Outcomes are `applied` or `skipped` with a reason. Hidden membership and absent
membership both produce the same `not_found` skipped outcome; no unselected or
hidden row is identified.

Status-change requests that omit Public Update creation must include
`skip_public_update: true` and a non-empty `skip_reason`. The audit event must
record `public_update_created` or `skipped_with_reason`, the previous and next
reporter_facing_status, actor id, managed_system_id, and source action id.

VOC Cluster endpoint catalog: [voc-clusters.md](voc-clusters.md) §VOC Cluster.

## PATCH /vocs/:id/description — Reporter pre-triage edit (Slice 3 #17)

| Aspect | Contract |
|---|---|
| Purpose | Reporter-only edit of `title` / `description_rich_content` / `attachment_ids` while VOC is in `triage_state='untriaged'`. Closes Slice 3 BE exit criterion (`docs/implementation/08-mvp-slice-plan.md`). |
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · `Authorization: Bearer <session>` |
| Body | `{ title?: 1..200, description_rich_content?: TipTapDoc, attachment_ids?: uuid[] }` — at least one field; `.strict()` (zod) rejects unknown keys |
| Forbidden fields (UX-named) | `severity`, `owner_user_id`, `owner_team_id`, `analytics_area_id`, `triage_state`, `cluster_decision`, `reporter_facing_status`, `source_context`, `primary_managed_system_id`, `reporter_id`, `archived_at`, `workspace_id`, `display_id`, `id`, `created_at`, `updated_at` → 422 `validation.unexpected_field` |
| Permission | `actor.actor_id === voc.reporter_id` — exclusive. Admin / Developer (with capability) / any non-reporter → 403 `permission.denied`. No admin elevation on this endpoint. |
| State gate | `voc.triage_state === 'untriaged'` — else 409 `conflict.triage_already_committed` with `detail.current_triage_state` |
| Optimistic concurrency | `If-Match` compared against `voc.updated_at`; mismatch → 409 `conflict.stale_write` with `detail.current_updated_at` |
| Service ordering | `SELECT FOR UPDATE voc → reporter check → state gate → If-Match → SELECT FOR UPDATE managed_system → sanitize description (surface `voc-description`) → link `attachment_ids` with `linkAttachments` in the same transaction → diff → UPDATE (only when diff is non-empty) → audit emit → refresh envelope` |
| Empty-diff semantics | If sanitizer normalizes input to match current row (per-field check; description hashed via `stableStringify` → SHA-256) → 200 returns current envelope without bumping `updated_at` and without emitting an audit row. Idempotency cache still records the 200 envelope so replay is byte-equal. |
| Audit event | `voc_description_edited` with `changes: { title?: {from, to}, description_rich_content?: {from_hash, to_hash}, attachments?: {from, to} }` (per-field shape; non-empty required). |
| Idempotency hash | Includes `vocId`, `ifMatch`, route, and request body — a retry with a refreshed `If-Match` (post-409 refetch) produces a new hash; client must mint a fresh `Idempotency-Key` for each distinct `If-Match` value (same caveat as `PATCH /vocs/:id`). |
| Rate limit | 30/min per actor — dedicated `reporterEdit` bucket, separate from the 10/min `mutation` tier. |
| Error codes | `validation.failed` · `validation.unexpected_field` · `permission.denied` · `not_found.record` · `conflict.triage_already_committed` (new in #17) · `conflict.stale_write` · `conflict.record_archived` · `conflict.parent_archived` · `conflict.idempotency_key_reuse` · `rich_content.disallowed_node` · `rich_content.disallowed_attr` · `rich_content.invalid_attr_value` · `rich_content.missing_required_attr` · `rich_content.external_image_forbidden` · `rate_limited.actor` |

## VOC Similarity Projection

`GET /vocs/pre-submit-peers?managed_system_id=<uuid>` is an authenticated,
read-only pre-submit peer query. It returns `200 { items: [{ id, display_id,
title, created_at }] }`: at most three active, authorized VOCs in the session
workspace and requested primary Managed System, ordered `created_at DESC, id
DESC`. `managed_system_id` is required and must be a UUID (`422
validation.failed`); a nonexistent or unreadable Managed System and no peers
are normal `200 { items: [] }` results. It uses the per-actor read rate-limit
tier and must not expose embedding availability, scores, totals, or counts.

`GET /vocs` returns a real `similar_count` for each list item. `GET /vocs/:id`
returns that same sole total plus `similar: { items }`; items are capped at
three, ordered `created_at DESC, id DESC`, and contain only `id`, `display_id`,
`title`, `reporter_facing_status`, and `severity`.

The peer predicate requires the same workspace and primary Managed System,
active (non-archived) status, non-self identity, and peer visibility through
the actor's `voc.read` scope or peer reporter ownership. Reporter ownership of
the source does not broaden peer visibility. Summary/triage-only envelopes omit
similarity entirely. Detail ignores `If-None-Match` and returns 200 while this
peer-derived projection has no projection-aware validator. See ADR-0031.

## Task release side effect (Issue #165)

`PATCH /tasks/:id` changing Task status into `released` snapshots active direct
`voc -> task evidence_of` links whose VOCs are active and in the same workspace,
then atomically publishes `tasks.create_public_update_review_candidates` inside
the request transaction. This endpoint exposes no candidate read/act API and
does not change Reporter-Facing VOC Status or create a Public Update.

`GET /vocs/:id/public-update-candidates` returns pending released-Task review
candidates only to Admins and Developers with `voc.triage` on the VOC's Managed
System. `POST /vocs/:id/apply-public-update-candidate` accepts a discriminated
`apply` or `dismiss` action. Apply requires the reviewer-supplied Public Update,
including `next_reporter_facing_status`; it never derives reporter status from
Task state (ADR-0005), creates the normal Public Update/audits, then actions the
candidate. Dismiss requires a non-empty `dismissal_reason` and records
`public_update_review_candidate_dismissed`. An out-of-scope Developer receives
the same `404 not_found.record` as an absent VOC; a Reporter receives `403`.
