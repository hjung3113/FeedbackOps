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
link. Only Finding-domain commands may write these tuples; the forthcoming
`POST /survey-responses/:id/create-finding` command writes
`generated_finding`. `created_finding` is not a Survey Response lineage
relation.
