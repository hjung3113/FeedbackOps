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
GET /vocs/:id/public-update-candidates
POST /vocs/:id/apply-public-update-candidate
GET /vocs/:id/recommendations
POST /vocs/:id/recommendations/:candidate_id/confirm
POST /vocs/:id/recommendations/:candidate_id/dismiss
POST /vocs/:id/create-finding
POST /vocs/:id/request-task
POST /vocs/:id/public-updates
POST /vocs/:id/reporter-replies
POST /vocs/:id/internal-comments
```

## VOC Create And Conversation Contract

`POST /vocs` request body must include:

```text
primary_managed_system_id required
title required
description_rich_content required (TipTap doc)
analytics_area_id optional
source_context optional enum: direct_use | proxy_report | operational_discovery | stakeholder_request
attachment_ids optional uuid[] (max 10, pre-uploaded via POST /attachments)
```

`title` must contain at least one character after trimming; the trimmed value is
stored. `description_rich_content` must contain non-whitespace content. Either
required-value violation returns `422 validation.failed`.

`POST /vocs` must not accept the following server fields:

```text
reporter_id
severity (voc.severity_not_user_settable)
reporter_facing_status
triage_state
display_id
(all others: validation.unexpected_field)
```

Optional nullable `owner_user_id` / `owner_team_id` require server `voc.triage` on
this Managed System; ordinary Reporter input still returns `validation.unexpected_field`.
Explicit Actor/team/null skips defaults. Omission resolves eligible Managed System owner,
then active same-system Analytics Area owner team, then null fallback. Creation stays
`untriaged`, with null severity and `received` reporter status. The response and
`voc_created` audit carry the persisted pair, `default_resolved`, `source_rule`
(`explicit`, `managed_system_owner`, `analytics_area_owner`, `workspace_fallback_queue`),
and `managed_system_id`. Configured-but-invalid skipped candidates append safe diagnostics
regardless of the final outcome; empty (`missing`) skipped candidates append only when
creation ends at `workspace_fallback_queue`, within the same transaction. Replays and
rejected creation append nothing. Actor eligibility uses current `voc.triage`
including explicit denies, expiry and revocation. Teams must be active and same-workspace.

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
edit/delete, reaction, read receipt, or threaded reply behavior. Internal
Comments accept `mentions` (Actor ids, validated in `conversation-service.ts`);
Public Updates and Reporter Replies do not. Admin
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
| Purpose | Reporter-only edit of `title` / `description_rich_content` / `attachment_ids` while VOC is in `triage_state='untriaged'`. Closes the Slice 3 BE exit criterion. |
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · session cookie |
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

## VOC List And Triage Fields

`GET /vocs` (query schema `listVocsQuerySchema`, `packages/shared/src/vocs/list-query.ts`):

- `tab=untriaged` with `view=triage` is `triage_state = 'untriaged' AND triage_state_review_postponed_at IS NULL`: postponed VOCs are excluded and are in `tab=waiting`. With `view=inbox` or `view=my`, `tab=untriaged` stays `triage_state = 'untriaged'` and still includes postponed rows, because those views have no `waiting` tab (`tab=waiting` is triage-only).
- `view=triage` (every tab) and the Triage navigation counts (`voc.triage`, `voc.tab.*` on `GET /nav/counts`) exclude VOCs whose primary Managed System is archived (#951): Triage shows only actionable items, and every triage command on such a VOC fails with 409 `conflict.parent_archived`. `view=inbox` / `view=my` still return those VOCs. The counts drop with the queue because they are computed from the same `buildVocListPredicate`. `pin_voc_id` drops such a VOC silently, like an archived VOC.
- `pin_voc_id` (uuid, #383) is valid only with `view=triage`; any other view returns `422 validation.failed` (`invalid_for_view`). It prepends one VOC that the triage tab predicate would exclude, so the detail panel's re-triage deep link works on an already-triaged VOC. It is honoured only inside the caller's triage scope: an out-of-scope, archived, foreign-workspace, or unknown id — and, since #951, a VOC of an archived Managed System — is dropped silently with `200` (a 403/404 would be an existence probe). A VOC the tab already returns is not duplicated, and `page.cursor` / `page.has_more` come from the tab query alone.
- `q` (string, #821) is valid for `view=inbox` and `view=my`; with `view=triage` it returns `422 validation.failed` (`invalid_for_view` at path `q`), the same shape as `pin_voc_id`. It is trimmed, an empty or blank value is treated as absent (no filter, no error), and more than 100 characters returns `422 validation.failed` at path `q` (zod `too_big`). Matching is case-insensitive: `display_id ILIKE <q>%` (prefix) OR `title ILIKE %<q>%` (contains), with `\`, `%`, and `_` escaped and `ESCAPE '\'`, so `%` and `_` match literally; only bound parameters are used — never interpolation. `q` is applied inside the list predicate after the read-scope clause, so a VOC outside the caller's read scope never appears because its title matched, and `out_of_scope_summary` ignores `q`: it stays the count it would be without `q`, so the summary cannot be used to probe titles. Counts, navigation counts, and `pin_voc_id` never take `q`. Cursor pagination keeps working with `q` (same sort keys). Index decision: no new index in this PR — the predicate already narrows by workspace, archived, and Managed System scope, the VOC table is single-workspace and small, and a trigram index would need a superuser-bootstrapped extension (like pgvector). Revisit when list latency is measured as a problem.
- Each `VocListItem` includes required `review_postponed_at: string | null`: an ISO timestamp mapped from `triage_state_review_postponed_at`, or `null` when not postponed. Only the authorized `view=triage` exposes the timestamp; every other view (including reporter `view=my` and `voc.read`-only inbox reads) returns `null`, preserving the required nullable response shape. No separate read surface is added. Triage `tab=unassigned` and `tab=high` retain postponed rows.
- The response is `{ items, page: { cursor?, has_more }, out_of_scope_summary? }`. `out_of_scope_summary: { count, severity_distribution }` is computed for `view=inbox` with a scoped read and is omitted when there is nothing outside the caller's scope (`voc/read/list.ts`).

`PATCH /vocs/:id` (body schema `packages/shared/src/vocs/patch-request.ts`, `.strict()`) accepts `severity`, `owner_user_id`, `owner_team_id` (not both non-null), `analytics_area_id`, `triage_state`, `postpone_review`, and compensation-only `restore_review_postponed_at`. `postpone_review: true` sets `triage_state_review_postponed_at` on an untriaged VOC and emits `voc_triage_postponed`; on a VOC that is not untriaged it returns `422 validation.failed` (`invalid_state`). `postpone_review: false` clears `triage_state_review_postponed_at` to null on an untriaged VOC whose timestamp is set and emits one `voc_triage_postpone_cleared` row (same detail shape as `voc_triage_postponed`: `voc_id`, `actor_id`); when the VOC is not postponed the timestamp is unchanged and no postpone audit row is written. `postpone_review` together with `triage_state` is `422 validation.failed`. Other fields in the same request keep their normal audit rows and are applied in the same transaction. `restore_review_postponed_at` accepts an ISO-8601 datetime with offset only together with `triage_state: 'untriaged'`, mutually exclusive with `postpone_review`, and only when the current VOC is not untriaged. Invalid shape or field combinations return `422 validation.failed` at `restore_review_postponed_at` (the existing `postpone_review`/`triage_state` mutex still reports `postpone_review` first). A currently untriaged VOC returns `422 validation.failed` (`invalid_state`); a timestamp later than database `NOW()` returns `422 validation.failed` (`invalid`), both at `restore_review_postponed_at`. Restoration writes the exact supplied instant with no postpone audit row (`voc_triage_postponed` or `voc_triage_postpone_cleared`); ordinary triage-state/severity/owner/Analytics Area audits remain unchanged. New postpones store `date_trunc('milliseconds', NOW())` so the authorized read timestamp round-trips exactly; older postpones restore to the client-visible millisecond.

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
the request transaction. `PATCH /tasks/:id` itself exposes no candidate API; the
review endpoints are below. It does not change Reporter-Facing VOC Status or
create a Public Update.

`GET /vocs/:id/public-update-candidates` returns pending released-Task review
candidates only to Admins and Developers with `voc.triage` on the VOC's Managed
System. `POST /vocs/:id/apply-public-update-candidate` accepts a discriminated
`apply` or `dismiss` action. Apply requires the reviewer-supplied Public Update,
including `next_reporter_facing_status`; it never derives reporter status from
Task state (ADR-0005), creates the normal Public Update/audits, then actions the
candidate. Dismiss requires a non-empty `dismissal_reason` and records
`public_update_review_candidate_dismissed`. An out-of-scope Developer receives
the same `404 not_found.record` as an absent VOC; a Reporter receives `403`.

## POST /vocs/:id/create-finding

`POST /voc-clusters/:id/create-finding` reuses this request body and
idempotency rules; its own behavior is in [voc-clusters.md](voc-clusters.md).

```text
requirement_id: FOP-FIND-001
headers: Idempotency-Key UUIDv4 required
request body: strict object
  title string, trimmed, 1..200
  summary string, trimmed, required non-empty
  severity low|medium|high|critical required
  confidence optional low|medium|high
  owner_actor_id / owner_team_id optional nullable uuid (Finding responsibility)
  analytics_area_id optional uuid
  primary_managed_system_id optional uuid; defaults to the VOC's Primary
    Managed System and, when sent, must equal it
response body: 201 FindingDto with source_type 'voc', source_id <voc id>, and
  source { type: 'voc', id: <voc id>, relation_type: 'created_finding', link_id }
auth and permission:
  authenticated Actor in the workspace
  source VOC readable: the Reporter, or an Actor with voc.read on the VOC's
    Managed System (Admin included)
  finding.manage on the target Managed System (checkFindingManage with
    requireElevatedRole: false; Admin bypasses the grant)
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - missing Idempotency-Key: 422 validation.failed
  - Idempotency-Key is not a UUIDv4: 422 validation.malformed_idempotency_key
  - invalid body or unknown keys: 422 validation.failed
auth and state errors, in check order:
  - VOC missing, archived, or not readable by the Actor: 404 not_found.record
    (the same envelope for all three)
  - target Managed System missing: 404 not_found.record
  - target Managed System archived: 409 conflict.parent_archived, field path
    primary_managed_system_id
  - Actor cannot manage Findings on the target Managed System: 403
    permission.denied
  - primary_managed_system_id differs from the VOC's Primary Managed System:
    422 validation.failed, field path primary_managed_system_id, code
    managed_system_mismatch
  - analytics_area_id unknown: 404 not_found.record
  - analytics_area_id in another Managed System: 422 validation.failed, field
    path analytics_area_id, code out_of_scope
  - analytics_area_id archived: 409 conflict.parent_archived, field path
    analytics_area_id
side effects: INSERT one Finding (source_type 'voc', source_id <voc id>) and
  one (voc, finding, created_finding) entity link with visibility
  internal_only, scoped to the VOC's Primary Managed System, in one
  transaction
audit events: finding_created_from_voc (subject is the Finding);
  entity_link.created when the link row was newly inserted
entity_links: (voc, finding, created_finding)
idempotency behavior: Idempotency-Key required. The hash is the raw body plus
  the VOC id and the route identity voc.create_finding. Replay of the same key
  and hash returns the stored 201; a reused key with a different hash is 409
  conflict.idempotency_key_reuse. Overload on the configured mutation bucket
  is 429 rate_limited.actor.
```

## VOC Recommendations

Embedding-based similar-VOC recommendations for one source VOC
(FR-VOC-004, `docs/adr/0034-voc-embedding-similarity-infrastructure.md`). The
ADR-0031 same-Managed-System projection in "VOC Similarity Projection" above
is a separate read. Recommendations are computed on read and never create or
join a cluster by themselves; only `confirm` does.

A VOC is visible to an Actor under the single ADR-0031 rule: the Actor has
`voc.read` scope on the VOC's Managed System (Admin has workspace-wide scope)
or reported it, and the VOC is not archived. The source VOC and every
candidate pass that rule.

`GET /vocs/:id/recommendations`

```text
requirement_id: FR-VOC-004
response body: 200, header Cache-Control: private, no-cache
  { available: true, embedding_version: int, items: Item[], total: int }
  { available: false, reason: "provider_disabled" | "source_not_embedded",
    embedding_version: int, items: [], total: 0 }
  Item { voc_id: uuid, display_id: string, title: string,
    severity: low|medium|high|critical|null, reporter_facing_status,
    score: number 0..1 }
  provider_disabled: the environment has no embedding provider.
  source_not_embedded: the source VOC has no vector at the active
    embedding_version yet. available false is never a silently empty list.
  items are candidates with cosine similarity score >= 0.75 (pinned in code,
    ADR-0034 D5), ordered by score DESC then id, at most 10. total counts all
    visible qualifying candidates before the 10 cap, so it can exceed
    items.length.
  Excluded and uncounted: archived VOCs, VOCs the Actor cannot see, the
    source itself, source-to-candidate pairs already confirmed, and pairs
    dismissed under the Actor's dismissal scope (below).
auth and permission: authenticated Actor in the workspace; source VOC visible
  to the Actor
validation errors: id path param is not a UUID: 422 validation.failed, field
  path id
auth and state errors: source VOC missing, archived, or not visible:
  404 not_found.record
idempotency behavior: none (read). Read rate-limit tier.
```

`POST /vocs/:id/recommendations/:candidate_id/dismiss` and
`POST /vocs/:id/recommendations/:candidate_id/confirm`

```text
requirement_id: FR-VOC-004
request body: none. No Idempotency-Key is read.
auth and permission:
  authenticated Actor in the workspace; both the source VOC (:id) and the
  candidate VOC (:candidate_id) visible to the Actor
validation errors:
  - id or candidate_id path param is not a UUID: 422 validation.failed, field
    path id or candidate_id
  - :id equals :candidate_id: 422 validation.failed, field path
    candidate_voc_id, code invalid
auth and state errors:
  - either VOC missing, archived, or not visible: 404 not_found.record. The
    same envelope for all three, so the response never confirms that an
    unreadable candidate id names a real VOC (ADR-0034 D4).
idempotency behavior: none. Mutation rate-limit tier.
```

`dismiss` records a dismissal for the pair at the active `embedding_version`
and returns `204` with no body. The dismissal scope is the ADR-0031 arm that
let the Actor see the candidate: the candidate's Managed System when it is in
the Actor's `voc.read` scope (Admin included), shared by every Actor with that
scope, or the dismissing Actor alone when the Actor could see the candidate
only as its Reporter. A repeat dismissal of the same pair under the same scope
and `embedding_version` leaves the stored decision unchanged. Audit event:
`voc_recommendation_dismissed` (subject is the source VOC).

Within this saved recommendation resource, `confirm` is the only path that creates or joins a cluster, through the same
cluster commands as `POST /voc-clusters` and `POST /voc-clusters/:id/vocs`,
inside one transaction. It returns `200`:

```json
{ "voc_cluster_id": "uuid", "cluster_created": true }
```

- If the source VOC is already a member of a cluster in its Primary Managed
  System, `confirm` joins the newest such cluster (`cluster_created: false`).
  Otherwise it creates a cluster titled with the source VOC's title and adds
  the source VOC as a member (`cluster_created: true`).
- It then adds the candidate VOC as a member. A candidate that is already a
  member is not an error.
- The source and candidate must share a Primary Managed System; otherwise
  `422 validation.failed`, field path `candidate_voc_id`, code `out_of_scope`.
- Cluster authorization applies: Admin, or Developer with `finding.manage` on
  the Managed System; otherwise `403 permission.denied`.
- The decision is stored as confirmed with the cluster id; a confirmation
  replaces an earlier dismissal of the same pair under the same scope. A
  confirmed pair is excluded from `GET /vocs/:id/recommendations` for every
  Actor at that `embedding_version`.
- Audit events: `voc_recommendation_confirmed` (subject is the cluster) plus
  the cluster commands' own audit events (`voc_cluster_created`,
  `voc_cluster_member_added`) as applicable, committed in the same
  transaction.

## Close-out responsibility (ADR-0067; VOC/Finding implemented by #1090)

VOC create keeps ordinary Reporter owner fields forbidden. Privileged owner
Actor/team override requires server `voc.triage`; authorized explicit null opts out and
omission requests defaults. Persist existing owner fields while remaining untriaged;
invalid explicit assignment rejects `validation.failed`, absent/invalid automatic defaults
fall through to existing scoped unassigned queue with Admin warning. Creation DTO/audit
returns safe routing metadata, with no private skipped-candidate IDs for Reporter.
VOC-origin Finding transitions use the destination resolver and retain source
visibility and atomic links/audit/replay. Task Request routing remains the separate 56-F item. Optional later triage assignment remains valid.

## Analytics Area report destination extension (ADR-0069)

These keys are accepted **proposed/new**, not implemented by #1071. Keep existing unfiltered,
legacy and paging behavior. Apply workspace and source authorization before Area filtering,
counts and page limits. A UUID matches only the source's own current `analytics_area_id`;
`unset` matches null. A syntactically valid unknown, foreign or System-incompatible Area yields
an empty authorized result, without catalog existence disclosure. Archived referenced Areas
remain filterable; they are not selectable as new classifications. Browser key is
`filter.analytics_area=<uuid|unset>`; clients translate it to the owning wire query key below.
Grouped report counts and exact list membership must share the owner predicate, including
cross-source availability rules; hidden links are not absent links. These ordinary reads write
no source records or domain audit events. Source repair commands keep their existing gates/audits.

For `GET /vocs`, broaden the existing wire `filter.analytics_area` from `unset` to UUID or `unset`;
no alternate wire key is introduced. `/vocs?view=inbox` without a tab is the non-archived total,
including resolved/closed VOCs. `tab=unassigned` requires both owner fields null;
`tab=no-task` is the direct active VOC→Task complement, a connection inspection rather than
mandatory work. `tab=high-no-link` matches high/critical severity and missing canonical expected
follow-up: no direct or qualifying cluster-origin Finding/Task Request/Task follow-up and no current
authorized no-follow-up resolution. Canonical resolution comes from scheduled ADR-0059 D3 work;
this extension does not implement its storage or a second recovery lifecycle. Count each VOC once.
Report links include the source Managed System UUID and Area UUID/unset. Existing Triage's archived
Managed System exclusions remain; report links use Inbox so retained context is still readable.

## VOC Cluster suggestions (ADR-0068; BE/shared shipped #1097; UI #1098 pending)

Requirement: FOP-VOC-003/004, FOP-OUT-004. VOC owns the separate non-domain
suggestion resource. Its read/generation never writes a Cluster or saved
recommendation decision. Existing saved confirm/create/join semantics above
remain unchanged; the new command is a second explicit human creation path.

```text
GET /voc-cluster-suggestions?managed_system_id=<uuid>
POST /voc-cluster-suggestions/:id/confirm
POST /voc-cluster-suggestions/:id/discard
POST /voc-cluster-suggestions/:id/restore
```

All routes require session/workspace validation. List filters the caller's
Finding-read MS scope, requires elevated `finding.read` and both active VOCs
readable through the existing VOC predicate, then C6 eligibility before ordering
and limit. Optional UUID MS filter grants no authority. Read tier; response
`200 { items }`, maximum 20 eligible pending pairs, score DESC/sorted UUID ASC.
Each item is `{ id, primary_managed_system_id, revision,
embedding_version, source_hashes:[hash_a,hash_b],
vocs:[{id,display_id,title,description_rich_content}, {...}] }`, in sorted UUID
order. Both bodies are current authorized VOC prose, not cached shadow text.
No partial pairs, unfiltered total, score/confidence, severity or Cluster ID.
Provider disabled returns `200 { available:false, reason:'provider_disabled',
items:[] }`; enabled reads return `200 { available:true, items }` (possibly
empty). This availability union is separate from saved recommendations/preview.

C6 first requires both active-version embeddings' source-row watermarks to be
at least the current VOC `updated_at`. Generation/read/confirm/restore recompute
`deriveVocEmbeddingInput(...).sourceHash` in TypeScript and compare both hashes
to scoring rows; provider/model/dimensions/version must match the pair and the
stored metadata and the active provider identity. Incompatible dimensions are
filtered before cosine distance.
Generation pins the independent `VOC_CLUSTER_SUGGESTION_CUT = 0.85`; saved
recommendations retain 0.75. Metadata refresh increments revision once, identical
retry changes nothing and spends no admission.

Reads filter elevated Finding scope and both canonical VOC visibility predicates
in SQL before ordering or paging. They use score DESC/sorted VOC UUID ASC/suggestion
ID ASC keyset pages of 100 visible candidates, checking C6 on each page, and
continue until 20 eligible pairs or exhaustion, stopping after 10,000 visible
candidates and returning only complete pairs found. This read ceiling never
limits whole-workspace occupancy calculation. No total is returned.

Mutation tier; required UUIDv4 `Idempotency-Key` and strict body:
`{ expected_revision, embedding_version, source_hashes:[hash_a,hash_b] }` for
confirm/restore, `{ expected_revision }` for discard. `expected_revision` is a
positive integer. Permission is elevated `finding.manage` on MS plus both VOC
reads, rechecked before replay. Missing/foreign/unreadable suggestion or VOC
is identical `404 not_found.record`; readable pair without management capability
is `403 permission.denied`; malformed inputs are `422 validation.failed`.
Stale revision/text/vector, membership, veto or restore expiry/conflict is
`409 conflict.stale_write`, without hidden pair detail. Same key with changed
request is `409 conflict.idempotency_key_reuse`. Serialize with coordinated
workspace/MS/member locks before the suggestion row and Cluster commands.

Confirm rechecks ADR-0068 C6, creates one human Cluster with title from the
reviewed sorted-first VOC, adds exactly two members and confirms it atomically.
`201 { voc_cluster_id, cluster_created:true }`; same-key replay or already
confirmed authorized command returns `200` with that same result, no second
Cluster/audit. Terminal confirmed replay still requires current pair read/manage
access, but does not rerun pending-membership eligibility against its own result.
Concurrent membership acquisition returns stale instead of joining. It writes
suggestion state/reference, existing Cluster creation/member/confirmation audits
and `voc_cluster_suggestion_confirmed`, all in one transaction. It
writes no saved recommendation decision or Entity Link and creates no execution
work. Existing domain Cluster APIs apply afterwards.

Discard sets soft discard actor/time and increments revision, retains the pair
across versions, returns `200 { id, revision, discarded_at, undo_until }`.
Repeat discard (with current revision) is a no-op and cannot extend the original
five-minute deadline. Restore is only by the original discard actor within that
server deadline; other actors receive `403 permission.denied`. After C6,
disjointness/pending-cap rechecks it clears that discard's veto and returns
`200 { id, revision }`; repeat successful restore with current revision is a
no-op. Same-key replay returns the original command result after authorization,
without mutating or renewing grace. Confirmed suggestions cannot be discarded
or restored. Changed human actions write suggestion discard/restore
audit events; no-op/replay/reads write none. These actions cannot delete or undo
Cluster/member/link/audit work, and affect no Dashboard/coverage queues.

## Draft Similar-VOC Preview (ADR-0068; shipped by #1099)

`GET /vocs/similarity-preview/availability` uses the POST's session/workspace
preHandlers for every role and the normal read rate tier. No request body or
Idempotency-Key is required. It returns strict `200 {available:true}` when
`VOC_SIMILARITY_PREVIEW=enabled` and `isEmbeddingEnabled` is true, otherwise
`200 {available:false, reason:'provider_disabled'}`. Cache control is
`private, no-cache`; unauthenticated requests return 401. This config-only read
performs no provider calls, paid ledger/budget writes, domain audit, Entity Link
or dashboard side effects. The normal read-tier abuse bucket remains in effect.
The create screen renders the semantic card only after `available:true`, with
no placeholder while loading, on error or when unavailable (ADR-0068 amendment,
2026-10-14). A POST `provider_disabled` outcome also hides the card.

Requirement: FOP-VOC-001/004, #340. `POST /vocs/similarity-preview`; strict body
`{ primary_managed_system_id:uuid, title, description_rich_content }`, existing
VOC title/rich-content validation, required UUIDv4 `Idempotency-Key`. Same
session/workspace boundary as VOC create; all roles, no triage/Finding grant.
Validate active selected MS without granting candidate reads. Existing request
body ceiling and 16 KiB UTF-8 derived prose ceiling are enforced before spend;
validation/rich-content errors use existing envelopes. Missing/foreign MS is
`404 not_found.record`; archived MS is `409 conflict.parent_archived`.

A distinct preview-abuse bucket is 10 requests/minute/actor, independent of
submit and paid budgets. Atomic Postgres paid reservation is actor 2/minute and
20/UTC day, workspace 10/minute and 100/UTC day across all roles/pods. If denied,
roll back all reservations; `429 rate_limited.actor` or
`rate_limited.workspace`, `{ budget_period:'minute'|'day', retry_after_seconds }`
and `Retry-After`. Fail storage with `500 internal.unexpected`, zero egress.
Disabled/invalid/unauthenticated/no-authorized-active-version-candidate inputs
make zero paid calls. With provider enabled and no authorized candidate, return
successful empty without spending a paid slot.

Sanitize content and send only `deriveVocEmbeddingText` prose, one input/call,
no attachment/mention attributes or candidate prose. Commit reservation before
cancellable provider I/O, ten-second deadline, zero automatic retries. All
attempts including failed/timeout/uncertain/crashed dispatch consume allowance.
Same-key changed canonical text/MS conflicts (`409 conflict.idempotency_key_reuse`);
concurrent/same-key retry never dispatches twice. VOC-owned ledger stores hashes
and provider/model/version metadata, never raw input or result IDs/titles.
Vector lives at most ten minutes, tombstone 24h; expiry applies even if cleanup
is late. Identical replay reauthorizes/requeries fresh candidates, never a cached
response body. In-flight/unknown outcome or incompatible in-flight configuration
returns `provider_outcome_unknown`; expiry returns `preview_expired`; new paid
attempt needs a new explicit button request/key.

```text
200 { available:true, items:[{id,display_id,title,created_at}] }
200 { available:false, reason, items:[] }
reason = provider_disabled | provider_failed | provider_timeout |
         preview_expired | provider_outcome_unknown
```

Candidate query: same current workspace/MS, unarchived, compatible active-version
embeddings with `e.updated_at >= v.updated_at`, `similarVocVisibilityPredicate`
before score ordering/limit; cosine >= 0.75, top three, score DESC/UUID ASC.
Recheck visibility and provider/model/version/dimensions after completion and
on replay. A true empty result is `available:true`; quota/unavailable is never
empty-success or heuristic fallback. No score/severity/private fields/total.
No VOC, Cluster/member, recommendation decision, domain audit, Entity Link or
Dashboard mutation. Operational budget/ledger writes and sanitized logs only.
Submission and saved embedding enqueue remain independent. Preview admission
is controlled by `VOC_SIMILARITY_PREVIEW=enabled|disabled` (default enabled),
independently of submission and saved embedding enqueue; no workspace settings UI.

Implementation details (#1099): sanitize first, derive text, then enforce
`VOC_SIMILARITY_PREVIEW_MAX_TEXT_BYTES = 16 * 1024` UTF-8 bytes. Over the ceiling
returns `422 validation.failed` with `fields:[{path:['description_rich_content'],
code:'too_big'}]` before reservation. Before a new reservation, an EXISTS query
uses the same visibility, MS, unarchived, active-version, provider/model/dimensions
and watermark filters as ranking. No compatible readable candidate returns
`{available:true,items:[]}` with no ledger, budget or paid transport writes.
The watermark is a conservative freshness signal, not a recomputed source hash.
Provider identity is read without I/O via `identity()`; one provider instance is
shared by route and saved ingestion jobs. A preview-owned AbortController covers
the call and response body read; an aborted signal is a timeout regardless of
the provider error wrapper. No retry is dispatched.

Resolve an existing actor-scoped key before disable/existence/budget shortcuts:
changed canonical MS/text hash conflicts; reserved/outcome_unknown returns unknown;
current disable returns provider_disabled; succeeded with incompatible identity/version
returns unknown, then an expired vector returns preview_expired; failed/timed_out
replay their reason; otherwise requery current readable candidates. A budget denial
or duplicate claim rolls back all four increments and rereads the committed ledger
before returning a denial. Replays never renew vector/tombstone TTLs.

Migration `0070_voc_similarity_preview.sql` precreates
`voc.similarity_preview_cleanup`, registered unconditionally every ten minutes.
Cleanup nulls expired vectors while preserving vector_expires_at, deletes request
tombstones only after 24h, and deletes only ended UTC budget windows. New app
SELECT/INSERT/UPDATE/DELETE grants are confined to these two operational tables;
invoker triggers deny fops_app DELETE of live tombstones/windows.
