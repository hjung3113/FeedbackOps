# Finding

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Finding

```text
GET /findings
GET /findings/:id
GET /findings/:id/evidence-highlights
GET /findings/:id/comments
POST /findings/:id/comments
PATCH /findings/:id
POST /findings/:id/evidence-highlights
POST /findings/:id/link-evidence
POST /findings/:id/request-task
POST /findings/:id/link-task
```

Finding is not independently created through `POST /findings` as of Slice 6.
Creation happens only through source conversion routes:
`POST /vocs/:id/create-finding`, `POST /voc-clusters/:id/create-finding`, and
`POST /survey-responses/:id/create-finding`.

Finding-to-Milestone linking is future cross-system behavior and is not an MVP
Finding endpoint.

`PATCH /findings/:id` accepts strict body `{ status?, reason?, owner_actor_id?, owner_team_id? }` and returns the
updated `FindingDto`. Slice 6 supports only `draft -> active`,
`draft -> not_actionable`, `active -> not_actionable`, and
`not_actionable -> active`; `converted` and `archived` remain stored statuses but
are rejected as user-directed targets here. Authz reuses `finding.manage`.
Successful non-no-op transitions audit `finding_status_changed`; same-status
requests are `200` no-ops returning the current Finding. At least a status or owner key
is required. Owner-only edits preserve status and use current destination `finding.manage`
(Admin always bypasses even explicit deny), internal Actor/same-workspace active-team and
XOR validation. Omitted PATCH owner keys preserve their current value; both null clears.
A changed pair emits `finding_owner_assigned` with from/to Actor/team and Managed System.
Owner/status changes, audits and replay are atomic; invalid combined status rolls back all.
All Finding list/detail/create DTOs include required nullable `owner_actor_id` / `owner_team_id`;
`created_by` remains provenance.

`POST /findings/:id/link-task` accepts strict body `{ task_id: uuid }`, requires
`Idempotency-Key`, and returns the updated `FindingDto`. Authz is Admin or
Developer with `finding.manage` on the Finding Primary Managed System. The
target Task must exist in the same workspace and Primary Managed System. The
command rejects a different pre-existing `linked_task_id` with
`422 validation.failed` field code `already_linked`; relinking to the same Task
is a `200` no-op. Side effects are atomic: set `findings.linked_task_id`, create
the existing `(finding, task, requested_task)` entity link, audit
`entity_link.created` when inserted, and audit `finding_task_linked`.

## GET /findings — opt-in list pages

Query: `managed_system_id` (UUID), `execution=none`, `owner_actor_id` / `owner_team_id`
(UUID), `assignment=assigned|unassigned`, optional opaque `cursor`,
and optional integer `limit` (1..100). The list screen sends `limit=50`;
there is no server default for this list's limit. Without `limit`, the response
stays exactly `{ items: FindingDto[] }` for full-set consumers, including
navigation counts and Finding pickers. With `limit`, the response is
`{ items, page: { has_more, cursor?, total? } }`.

Order is `created_at DESC, id DESC`. The cursor continues both order columns
using the raw PostgreSQL timestamp (including microseconds) and UUID. It is
opaque to clients. `page.cursor` appears only when another page exists;
`total` appears only on the first page (no request cursor) and counts visible
rows under the same filters. An invalid cursor returns `422 validation.failed`,
`detail.fields: [{ path: ['cursor'], code: 'invalid_cursor' }]`. Invalid limits
also return `422 validation.failed` using the query validation envelope. Owner and assignment predicates apply before both
counts and pagination; assigned means either owner present, unassigned means both null.

Admin sees the workspace population. Developer visibility uses the existing
point `finding.read` checks once per distinct Primary Managed System, including
explicit denies, before the SQL page limit and counts. Empty allowed scope
returns no rows and a first-page total of zero. The same SQL visibility
predicate applies in full-set mode. `execution=none` currently keeps the active, no-linked-Task, no-active-requested-Task-Request
predicate. Its convenience-column test is superseded for implementation by the accepted ADR-0069
canonical-link predicate in the extension below (implementation pending).

Saved Finding views reject both `cursor` and `limit`; paging is transient list
state and is never persisted as a saved filter.

## Progress notes

`GET /findings/:id/comments` and `POST /findings/:id/comments` are the Finding
progress-note timeline (`docs/adr/0049-finding-task-progress-notes.md`,
FR-FIND-004). Rows live in `finding.finding_comments`. There is no edit or
delete route. `fops_app` may only `SELECT` and `INSERT`. Task progress notes
are a different contract: [tasks.md](tasks.md) §Progress notes.

Shared DTO: `FindingCommentDto` in `packages/shared/src/findings/comments.ts`.

```text
id uuid
finding_id uuid
actor_id uuid
kind: note | status_change
from_status: Finding status or null
to_status: Finding status or null
body_rich_content: TipTap document
created_at: ISO datetime
```

A `note` has both status columns null. A `status_change` has both set. GET
returns both kinds, newest first (`created_at DESC`, `id DESC`). POST creates
only `kind: note`. A `status_change` row is inserted by a successful Finding
status change, in the same transaction as `finding_status_changed`, not by
these routes. A same-status no-op writes neither the comment nor that audit.

`GET /findings/:id/comments`

```text
requirement_id: FR-FIND-004
query:
  cursor optional string. Base64 JSON { createdAt, id } taken from the raw
    Postgres timestamp of the last returned row, not a millisecond Date.
  limit optional integer 1..100, default 50
response body: 200
  { items: FindingCommentDto[], page: { cursor?: string, has_more: boolean } }
  page.cursor is present only when has_more is true
auth and permission:
  authenticated Actor in the workspace
  canReadFinding: Admin, or a Developer with finding.read on the Finding
    Primary Managed System (requireElevatedRole: true). A User is denied
    before grants are consulted, including a User who holds finding.read.
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - invalid query: 422 validation.failed
  - cursor that is not base64 JSON { createdAt, id }: 422 validation.failed,
    field path cursor, code invalid_cursor
auth errors:
  - missing Finding: 404 not_found.record. Checked before the read gate, so
    a missing Finding is 404 even for a User.
  - Finding exists but the actor cannot read it: 403 permission.denied
side effects: none. An archived parent Managed System still allows GET.
audit events: none
entity_links: none
dashboard queues: none
idempotency behavior: none (read). Overload on the configured read bucket is
  429 rate_limited.actor.
```

`POST /findings/:id/comments`

```text
requirement_id: FR-FIND-004
headers: Idempotency-Key UUIDv4 required
request body: strict object
  body_rich_content: non-blank TipTap document, sanitized on the
    internal-comment surface
  mentions: optional uuid array, max 50. When omitted, the body must contain
    no mention nodes. When present, it must be exactly the set of mention-node
    actor_id values in the body, and each id must be an Actor in this workspace.
  The client does not send kind. The inserted row is always kind note, with
    both status columns null. attachmentRef nodes are rejected.
response body: 201 { comment: FindingCommentDto }
auth and permission:
  authenticated Actor in the workspace
  canManageFinding: checkFindingManage with requireElevatedRole: false.
  An explicit finding.manage grant is enough, including for a User. Admin
  bypasses the grant.
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - missing or empty Idempotency-Key: 422 validation.failed
  - Idempotency-Key is not a UUIDv4: 422 validation.malformed_idempotency_key
  - invalid or blank body, or unknown keys: 422 validation.failed
  - mentions do not match the body's mention nodes: 422 validation.failed,
    field path mentions, code invalid
  - a mention actor_id is not in this workspace: 422 validation.failed,
    field path mentions, code cross_workspace
  - a mention node actor_id is not a UUID: 422 validation.failed,
    field path body_rich_content, code invalid_mention_actor_id
  - body contains an attachmentRef: 422 validation.failed,
    field path body_rich_content, code attachment_not_supported
  - sanitizer rejection: 422 rich_content.disallowed_node,
    rich_content.disallowed_attr, rich_content.invalid_attr_value,
    rich_content.missing_required_attr, or rich_content.external_image_forbidden
auth and state errors, in check order:
  - missing Finding: 404 not_found.record
  - parent Managed System row missing: 404 not_found.record
  - parent Managed System archived: 409 conflict.parent_archived
    (this is checked before the manage gate)
  - actor cannot manage the Finding: 403 permission.denied
side effects: INSERT one finding.finding_comments row, kind note
audit events: finding_comment_created. Subject is the Finding. Detail carries
  the comment id, actor id, and mention ids. A status_change row does not
  write this event.
entity_links: none
dashboard queues: none
idempotency behavior: Idempotency-Key required. Replay of the same key and
  hash returns the stored 201. The hash is the raw body plus the Finding id
  and the route identity finding.comment. A reused key with a different hash
  is 409 conflict.idempotency_key_reuse. Overload on the configured mutation
  bucket is 429 rate_limited.actor.
```

## Close-out responsibility (ADR-0067; implemented by #1090)

All VOC/Cluster/Survey-response create paths write nullable
`owner_actor_id` / `owner_team_id` through the Finding destination command. Resolve target
Managed System owner → active same-system Analytics Area team → scoped fallback; permitted
explicit value/null takes precedence, omission requests defaults. Validate target eligibility
with `finding.manage`; invalid explicit assignments reject `validation.failed`, invalid
automatic candidates skip with safe audit metadata/Admin warning. Preserve source gate,
entity links, creation state, rollback/idempotent replay, and no provenance backfill.
Creation responses and audits include the persisted owner pair, `default_resolved`,
`source_rule` (`explicit`, `managed_system_owner`, `analytics_area_owner`,
`workspace_fallback_queue`), and `managed_system_id`. Skipped-rule categories append through
Core diagnostics in the same transaction, never on replay/rejection. Normal reads use the
persisted pair; no default-edit backfill or provenance inference occurs. The source-owned
Finding detail displays/edits responsibility and the list persists its assignment filter in
URL state. No team candidate catalog or team membership administration is introduced.

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

`GET /findings` gains wire `analytics_area_id=<uuid|unset>` and `status=active`.
For report handoff metrics and the existing `execution=none` filter, execution is present only with
an active canonical `(finding, task_request, requested_task)` or `(finding, task, requested_task)`
link. `linked_task_id` is a convenience reference and is not the predicate's truth.
`execution=none` continues to restrict to active Findings, now using the canonical link complement;
draft/not_actionable/converted/archived Findings are not handoff gaps. Both filters work in full-set
and paged reads with identical authorized first-page totals. An existing direct Task connection is
not Task Request approval or work completion. Scope uses the existing elevated Finding read seam.

## Survey summaries and highlights — ADR-0064 cutover

Accepted target contract, pending coordinated #739/#740: Survey-derived Finding
list/detail/provider and mutation DTOs contain deterministic source metadata only
in title/summary and omit response IDs. Public parent `source_id` is NULL; exact
response binding and historical generated text remain in Survey-owned protected
extensions (proposed/new). New cached mutation bodies are metadata-only; confirmed
legacy Survey cache copies are sanitized under ADR-0015's dated exception.
Task Request/source defaults therefore never automatically propagate excerpts.

`GET /findings/:id/evidence-highlights` retains the existing Finding read gate.
Survey quote is hydrated in a batch from private bindings only with fresh
`survey.read` and exact active approval in one transaction snapshot. No personal
grant is needed for attached safe highlights, and their existing audience is
separate from candidate result suppression. Denied/revoked evidence retains safe
local highlight/classification metadata with quote omitted and an unavailable
state; never emit private response/approval bindings or denied source detail.
VOC quotes retain source/reporter checks; notes retain authored text. Preserve
ordinary VOC/Cluster source IDs rather than revoke them globally.

## POST /findings/:id/survey-evidence — proposed/new (#816, ADR-0064)

Accepted target contract; the existing generic raw Survey attachment stays rejected.

- **Request:** strict `{ approved_excerpt_id, analytics_area_id?, sentiment?,
  importance? }` using existing classification validation, required UUIDv4
  `Idempotency-Key`. No response UUID, caller quote, source title or summary.
  `approved_excerpt_id` is selected from the safe Survey candidate read, never
  typed as a raw response identifier in the UI.
- **Auth/validation:** in order: strict request/header validation, session workspace/Actor,
  target Finding existence/parent state and `finding.manage` under existing
  mutation rules, then resolve the workspace-bound approval/source and require
  source `survey.read`, non-draft result state, current result audience/suppression
  and exact active approval. Resolve the response
  internally through the Survey seam. Source Survey and target Finding may have
  different Managed Systems inside the same workspace; check each independently.
  No personal grant or new Admin personal bypass. Validate classification against
  the target, and recheck all rights inside transaction/response locking on submit.
- **Failures:** use existing error families: malformed/missing headers or strict
  body/selection failures `422 validation.failed` or
  `validation.malformed_idempotency_key`; missing/foreign/source-denied data
  `404 not_found.record`; target manage `403 permission.denied` under existing
  target ordering; draft `409 conflict.survey_results_unavailable`. Wrong/revoked
  or no-longer-visible approvals reject safely without returning stale text or
  hidden counts. Unknown/foreign/source-denied selections return 404; after source access,
  revoked or suppressed selections return 422 without excerpt/hidden counts.
  #816 route tests pin this order and strict field validation.
- **Transaction:** Finding command owns highlight lifecycle/counter and idempotency;
  Survey seam writes the protected binding/snapshot; Entity Links seam writes
  internal-only `evidence_of`. Two approvals of one response yield two highlights
  and one active response/Finding link. Never create `generated_finding` here.
  Use existing `evidence_highlight_added` and `entity_link.created` only when a
  link is inserted, with identifier-only audit detail, in the same transaction.
  Denial writes no mutation audit. No new Dashboard resolution rule is introduced:
  `evidence_of` does not clear an Outcome follow-up gap (ADR-0055).
- **Response (proposed/new):** `201 { evidence_highlight_id, finding_id }`, safe
  local mutation metadata only. Fetch quotes through the fresh highlight read.
  Same Actor/key/body/target retries replay safely without duplicate highlights,
  links/counters/audits; changed reuse is `409 conflict.idempotency_key_reuse`.
  Use existing mutation rate limiting. Concurrent revoke/attach follows the
  shared response-lock ordering; preview eligibility never authorizes later submit.

## Evidence inventory — ADR-0065 (#1106; runtime verification pending)

The endpoints and independent strict inventory schemas are implemented by #1106;
real-role runtime verification remains conductor-owned. These are Findings-owned
reads of stored highlights, not a standalone Evidence resource. ADR-0064 owns the Survey
projection/read boundary; do not restore raw binding/link/audit access.

### GET /evidence-highlights

Strict query: optional `managed_system_id` (UUID or `all`),
`source_type=voc|survey_response|note`, `q` (trimmed case-insensitive literal text,
max 200 characters; empty means no search), opaque `cursor`, integer `limit`
(1..100, default 50). Omitted/`all` means effective authorized scope union.
Response: `200 { items, page: { has_more, cursor? } }`; cursor only when another
eligible page exists. No total/facet counts. Order highlight `created_at DESC,
id DESC`, preserving stored timestamp precision. Cursor is bound to session
workspace/Actor and normalized scope/source/search; malformed or mismatched
cursor uses `422 validation.failed` with cursor field code `invalid_cursor`.

Session/workspace and elevated Finding read are mandatory: Admin or Developer
with canonical `finding.read` on each parent scope, including existing deny
semantics. User remains `403 permission.denied` even with a grant. Exclude
unreadable parent Findings. A valid unauthorized requested scope yields an empty
list, not a workspace bypass. Recheck rights/approval on each page.

Within the authorized parent set, project source content through the owning
module before text matching, ordering and pagination. Match only currently
readable quotes, safe source labels and parent title/display ID; never Finding
summary, hidden quote or denied source metadata. Withheld content may appear
under a matching safe parent label but cannot itself affect membership/order/
continuation. Survey attached highlights retain ADR-0064's linked audience;
picker suppression does not retroactively tighten it. Batch hydration must
preserve the same transaction snapshot/response-lock authorization as ADR-0064.
No one-Survey-transaction-per-row or nested-endpoint fan-out.

### GET /evidence-highlights/:id

Strict local highlight UUID, no query filters. Return `200` with the same item
projection, resolving independently of loaded pages. Missing/foreign/unreadable
parent/item returns `404 not_found.record`; invalid ID/query returns
`422 validation.failed`. Elevated role denial is `403 permission.denied`.
Frontend reconciles readable detail against current safe scope/source/search,
never treats page absence as a detail 404. Both inventory reads use existing
read rate limiting (`rate_limited.actor`) and have no link/mutation/personal-read
side effects.

### Proposed/new strict inventory item

- Local `id`, `finding_id`, target `primary_managed_system_id`, `source_type`,
  `analytics_area_id`, `sentiment`, `importance`, highlight `created_at`.
- Readable `finding: { id, display_id, title }`; Survey-generated title is
  ADR-0064 metadata-only. No `Finding.summary`.
- `content_state: available|withheld`; `quote_or_summary` is present only when
  available. Withheld local classification stays safe; omit denied source context.
- Optional strict `source` object selected by `source_type`: readable VOC
  `{ id, display_id, title, route }`; permitted Survey `{ survey_type,
  survey_display_id, question_label, identity_protected }`; note omits `source`.
  Withheld items omit denied context. Never a Survey response jump, even for holders.

Never include response IDs/ordinals, response/approval bindings, candidate
approval IDs, respondent identity, Survey title, exact submission time, raw
answers, raw Entity Links or audit JSON. Note authored text and ordinary VOC
source/reporter gates remain unchanged. Integration owns the read-only
`/integration/evidence` ListShell; adding/editing/execution stays in Finding.
