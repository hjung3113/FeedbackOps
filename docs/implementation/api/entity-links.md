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
The command-only `(voc_cluster, finding, evidence_of)` tuple is unavailable on
every generic entity-link surface: POST, both GET/list modes, and PATCH/detach.
Generic PATCH treats that tuple exactly as an absent link, returning the same
non-disclosing `404 not_found.record` envelope rather than a distinguishable
`422` response.

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
