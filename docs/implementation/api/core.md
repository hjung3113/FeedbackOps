# Core / Managed System / Analytics Area

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Core / Managed System / Analytics Area

```text
GET /managed-systems
POST /managed-systems
PATCH /managed-systems/:id
POST /managed-systems/:id/archive
GET /analytics-areas
POST /analytics-areas
PATCH /analytics-areas/:id
POST /analytics-areas/:id/archive
GET /actors?workspace=current
GET /actors/resolve?actor_ids=<csv-uuid>&team_ids=<csv-uuid>
GET /workspace/settings
PATCH /workspace/settings
```

`GET /workspace/settings` and `PATCH /workspace/settings` (Slice 9 #195) are
workspace-admin-only policy endpoints. Both require `workspace.admin`; a denied
caller receives `permission.denied` → `403`. The resolved response is always:

```json
{
  "permission_self_approval": "allowed | forbidden",
  "survey_anonymity_threshold": 5
}
```

When no `core.workspace_settings` row exists, GET returns the baseline defaults
`{ "permission_self_approval": "allowed", "survey_anonymity_threshold": 5 }`.
PATCH accepts a strict, non-empty partial of those two snake_case fields;
`survey_anonymity_threshold` is an integer from 5 through 50. It creates and
locks the workspace singleton in one transaction, updates only supplied
effective changes, and returns the complete resolved settings. An effective
no-op returns `200` without a mutation or audit event. Effective changes append
`workspace_settings_updated` for subject `workspace/<workspace_id>` with only
the changed `{ from, to }` entries in `detail.changes`.

`GET /actors/resolve` (Slice 3 #87) — workspace-scoped bulk identity lookup for
owner chips. Any session may read (low sensitivity, like `GET /actors`). Each id
must be a UUID; up to 200 per list. Ids outside the caller's workspace or
unknown are silently dropped (no cross-workspace identity leak). Empty/absent
lists yield empty arrays. Response:

```json
{
  "actors": [{ "id": "uuid", "display_name": "string", "email": "string" }],
  "teams": [{ "id": "uuid", "name": "string" }]
}
```
