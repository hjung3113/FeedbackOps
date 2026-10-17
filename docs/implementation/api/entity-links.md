# Entity Links

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Entity Links

```text
POST /entity-links
GET /entity-links
PATCH /entity-links/:id
```

Link detach/revoke is represented by `PATCH /entity-links/:id` status
transition. There is no hard-delete endpoint for entity links as of Slice 6.
Generic detach requires both-endpoint readability and the same mutation
capability creation requires for that tuple: source read and the target
provider's `canCreateTarget` when defined, otherwise target read. Missing
readability or creation capability returns the same non-disclosing
`404 not_found.record` as an absent link. Command-only tuples stay excluded.
Detaching `(finding, task, requested_task)` invokes the Findings-owned execution
projection seam inside the detach transaction; it clears `linked_task_id` when
no active `requested_task` link to a Task remains. Entity Links never writes
Finding tables directly. Link history, recovery capture and detach audit stay atomic.

The command-only `(voc_cluster, finding, evidence_of)` tuple is unavailable on
every generic entity-link surface: POST, both GET/list modes, and PATCH/detach.
Generic PATCH treats that tuple exactly as an absent link, returning the same
non-disclosing `404 not_found.record` envelope rather than a distinguishable
`422` response.

The `(voc, task_request, requested_task)` and `(voc_cluster, task_request,
requested_task)` tuples are command-only for generic writes. Generic POST
rejects them, and generic PATCH/detach returns the same non-disclosing `404
not_found.record` envelope as an absent link. Generic endpoint and workspace
lists continue to include their rows. Only `POST /vocs/:id/request-task` and
`POST /voc-clusters/:id/request-task` create them.

The `(survey_response, finding, generated_finding)` and `(survey_response,
finding, evidence_of)` tuples are also command-only. Generic POST rejects them,
generic endpoint and workspace lists omit their rows, and generic PATCH/detach
returns the same non-disclosing `404 not_found.record` envelope as an absent
link. Only Finding-domain commands may write these tuples; the shipped
`POST /survey-responses/:id/create-finding` command writes
`generated_finding`. `created_finding` is not a Survey Response lineage
relation.

Allowed entity-link DTOs may include optional `source_summary` and
`target_summary` internal summaries. Each summary is resolved through its
endpoint provider only after the row is authorized as `visibility_state=allowed`;
providers that do not supply an internal summary leave the field absent. Hidden
and denied DTOs never include endpoint IDs or internal summaries. A
`summary_visible` DTO continues to expose only its reporter-safe `summary`.

## Workspace inventory pagination

Workspace inventory mode is selected by `scope=workspace` or by omitting both
source and target endpoints. It accepts `limit` (default `50`, maximum `100`)
and an opaque `cursor`. The cursor continues the stable `created_at DESC, id
DESC` order. Pagination parameters are only valid for inventory mode; endpoint
relation reads keep their `{ items }` response and existing behavior.

Inventory responses are `{ items: EntityLinkDto[], page: { has_more: boolean,
cursor?: string, status_counts?: { active, stale, detached, revoked } } }`.
`page.cursor` is present only when another page exists. The first page without a
status filter includes `status_counts` for all list-visible rows matching the
relation type and Managed System filters. Status, relation type, and Managed
System filters apply to every page.

## ADR-0064 canonical-link access (accepted; #740 cutover)

Generic POST/GET/PATCH, all status filters, counts and cursors categorically
exclude either `survey_response` endpoint. After cutover ordinary repositories
read/write the explicitly column-listed owner-backed `core.entity_links_app`
`security_barrier` updatable view with `WITH CHECK OPTION`; app raw canonical
SELECT/INSERT/UPDATE (including surviving column ACLs) is revoked, no DELETE.
Canonical UUIDs, tuple checks, active uniqueness and detach history remain intact.
Ordinary creation serializes the tuple with a transaction advisory lock, looks up an
active ordinary row, and uses INSERT RETURNING through the view. Detach uses UPDATE
RETURNING. Real-role conflict/concurrency verification is required before deployment.

Survey writes use Entity Links-owned narrow functions returning link ID/inserted
state, not raw endpoint rows. Existing create-Finding writes `generated_finding`
and `evidence_of`; proposed/new #816 attachment writes `evidence_of` only. Results
uses the Survey-owned safe derived-Finding reader under independent source/target
Managed System gates; generic Survey detach remains unavailable. Raw app audit
SELECT is also revoked without deleting Actor/subject/detail history. Survey-derived
Finding provider summaries are metadata-only; quotes require the authorized Survey seam.
