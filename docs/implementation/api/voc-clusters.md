# VOC Cluster

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

Conversation and reporter-status rules that mention clusters stay in [voc.md](voc.md) §VOC Create And Conversation Contract.

## VOC Cluster

```text
POST /voc-clusters
GET /voc-clusters
GET /voc-clusters/:id
GET /voc-clusters/:id/candidate-peers
PATCH /voc-clusters/:id
POST /voc-clusters/:id/vocs
DELETE /voc-clusters/:id/vocs/:voc_id
POST /voc-clusters/:id/public-update-candidate
POST /voc-clusters/:id/apply-public-update-candidate
POST /voc-clusters/:id/create-finding
POST /voc-clusters/:id/link-finding
POST /voc-clusters/:id/request-task
```

Cluster membership changes are audited. MVP cluster APIs must not merge VOC
records. Cluster merge and split endpoints are out of scope for MVP.

**Field & behavior contract (#126):**

| Aspect | Contract |
|---|---|
| Create body | `POST /voc-clusters` `{ title: string(1..200), summary?: string\|null, primary_managed_system_id: uuid, severity?: 'low'\|'medium'\|'high'\|'critical'\|null, confidence?: 'low'\|'medium'\|'high'\|null, rationale?: string\|null, owner_user_id?: uuid\|null }` → `201` `VocClusterDto` (`status='draft'`). |
| List | `GET /voc-clusters` optional `?managed_system_id=<uuid>` → `{ items: VocClusterDto[] }`, workspace-scoped + MS-scope filtered. DTOs include nullable `severity`, `confidence`, `rationale`, `owner_user_id`, `confirmed_by`, and `confirmed_at`. Each `member_count` is the authorized-member total, filtered by the same member predicate as detail. |
| Detail | `GET /voc-clusters/:id` → `VocClusterDto` with the nullable workspace/provenance fields and authorized `members: [{ voc_id, added_by, added_at, display_id?, title?, severity?, reporter_facing_status? }]`; `member_count` equals the authorized `members` length. Member visibility is Admin, `voc.read` scope on that member's Managed System, or reporter ownership. |
| Same-MS candidate peers | `GET /voc-clusters/:id/candidate-peers` → `{ candidate_basis: 'same_managed_system_active_voc', candidates: [{ voc_id, display_id, title, severity, reporter_facing_status }] }`. This is temporary same-Managed-System membership-picker scaffolding, not semantic or embedding similarity; it emits no score, confidence, or rationale. Candidates are active VOCs in the cluster workspace and Primary Managed System, excluding existing members/source VOCs. The cluster read gate is Admin or Developer with `finding.read` on the cluster MS. Within that readable cluster, a candidate is included only for Admin, `voc.read` scope on the candidate MS, or candidate reporter ownership. `finding.read`, `finding.manage`, and triage/effective-summary scope never substitute for candidate `voc.read`; unreadable candidates are absent and uncounted. A readable cluster with no readable candidates returns `200` with an empty `candidates` array. |
| Edit / confirm | `PATCH /voc-clusters/:id` `{ title?, summary?, severity?, confidence?, rationale?, owner_user_id?, status?: 'confirmed' }` → `200`. `confirmed_by` and `confirmed_at` are rejected as unexpected client fields. A `draft`→`confirmed` transition atomically sets them to the actor and current time; subsequent confirmation requests preserve the original values. |
| Add member | `POST /voc-clusters/:id/vocs` `{ voc_id }` → `201` (inserted) / `200` (already a member). Member VOC must be in the cluster's managed system (else `422 validation.failed`); archived/unreadable VOC ⇒ `404`. |
| Remove member | `DELETE /voc-clusters/:id/vocs/:voc_id` → authorized removal `204`; unreadable VOC, missing VOC, and existing non-member all return the identical `404 not_found.record` envelope. (No request body — clients must not send `Content-Type: application/json` with an empty body.) |
| Bulk Public Update candidate | `POST /voc-clusters/:id/public-update-candidate` validates and returns shared draft content after `finding.manage`; it writes no Public Update or audit row. |
| Bulk Public Update apply | `POST /voc-clusters/:id/apply-public-update-candidate` accepts selected member `voc_ids` plus the candidate. Each readable selected member is delegated in its own transaction to the canonical per-VOC Public Update command, including its `voc.triage` recheck and normal audits; outcomes are `applied` or `skipped`. Hidden and absent membership both return the same `not_found` skip reason. |
| Create finding | `POST /voc-clusters/:id/create-finding` — body = `CreateFindingRequest` (same as `POST /vocs/:id/create-finding`); requires `Idempotency-Key` (UUIDv4). → `201` `FindingDto` with `source_type='voc_cluster'`, `source_id=<cluster id>`, `source={ type:'voc_cluster', id, relation_type:'created_finding', link_id }`. Writes `finding_created_from_voc_cluster` + the `entity_link.created` audit in the finding txn. |
| Link existing Finding | `POST /voc-clusters/:id/link-finding` — body `{ finding_id: uuid }`; requires `Idempotency-Key` (UUIDv4). It creates `(voc_cluster, finding, evidence_of)` and returns `201 { id, display_id, status }`; a duplicate active link returns `200` with the same body and writes no second audit. The actor must be able to read and manage both the cluster MS and the target Finding's own MS; an unreadable cluster or target is `404`, while a readable target without `finding.manage` is `403`. Writes `finding_linked_to_voc_cluster` and `entity_link.created`. |
| Unlink existing Finding | `POST /voc-clusters/:id/unlink-finding` — body `{ finding_id: uuid, reason: trimmed non-empty string }`; requires `Idempotency-Key` (UUIDv4). It first locks and verifies readable cluster then readable target Finding, then requires `finding.manage` independently on both endpoint Managed Systems. Missing, foreign-workspace, or unreadable endpoints return the identical `404 {"code":"not_found.record","message":"record not found"}` envelope; readable endpoints without required scope return `403 permission.scope_required`. It soft-detaches only the exact active `(voc_cluster, finding, evidence_of)` tuple and returns `204` with an empty body. Never-linked and already-detached tuples also return `204` with no audit. Same key and request replays `204`; reuse with changed cluster, Finding, or reason returns `409 conflict.idempotency_key_reuse`. A changed active row writes `finding_unlinked_from_voc_cluster` (subject Finding) and `entity_link.detached` atomically; relinking creates a new active row and an old-key replay never detaches it. |
| Request task | `POST /voc-clusters/:id/request-task` — body = `{ evidence_summary, requested_outcome }` (same as Finding request-task); requires `Idempotency-Key` (UUIDv4). → `201` `TaskRequestDto` with `source_type='voc_cluster'`, `source_id=<cluster id>`, `status='pending_review'`, `source={ type:'voc_cluster', id, relation_type:'requested_task', link_id }`. Writes `task_request_created_from_voc_cluster` + the `entity_link.created` audit in the task-request txn. |
| Authz | Read/list/candidate endpoint cluster gate = Admin OR Developer with `finding.read` on the cluster MS. Candidate item visibility additionally requires Admin, candidate-MS `voc.read`, or reporter ownership. Create/edit/confirm/member-add/remove/create-finding = Admin OR Developer with `finding.manage` on the cluster MS. Reuses the Finding capabilities (no `voc_cluster.*` caps) — see ADR-0024 §H. |
| Candidate-peer errors | Invalid cluster UUID → `422 validation.failed`; missing or cluster-unreadable → `404 not_found.record`; missing session → `401 authentication.required`; workspace mismatch → `403 workspace.mismatch`. A readable cluster with zero candidate authority is not an error and returns `200` with `candidates: []`. |
| Create-finding denial | Source-unreadable ⇒ `404 not_found.record` (hidden); readable-but-no-`finding.manage` ⇒ `403 permission.denied` (mirrors ADR-0024 §C). |
| Idempotency | `Idempotency-Key`-scoped (same as `POST /vocs/:id/create-finding`): same key replays the same finding; distinct keys create distinct findings. |
| Linked Findings visibility | `linked_findings` on both list and detail contains every active `created_finding` or `evidence_of` Finding link that is readable under Admin or `finding.read` on that Finding's own Primary Managed System. Unreadable targets are omitted entirely, including from list projections. |
| Audit events | `voc_cluster_created`, `voc_cluster_updated`, `voc_cluster_member_added`, `voc_cluster_member_removed`, `finding_created_from_voc_cluster`, `finding_linked_to_voc_cluster`, `finding_unlinked_from_voc_cluster`, `entity_link.created`, `entity_link.detached`, `task_request_created_from_voc_cluster`. |
