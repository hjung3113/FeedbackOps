# Core / Health / Managed System / Analytics Area

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Core / Health / Managed System / Analytics Area

```text
GET /health
GET /health/live
GET /health/ready
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

## Close-out settings and registry inputs (ADR-0067; implementation pending)

The response/body examples above describe shipped fields. The accepted extension adds
proposed/new `coverage_thresholds` to the full resolved settings response and strict
nonempty partial PATCH. Its exact metric IDs and pairs are in
`docs/design/15-data-contracts.md`; unknown/reserved IDs, incomplete pairs, nonintegers,
and cutoffs outside `0 <= warn < good <= 100` reject `validation.failed` without writes.
Missing rows/keys resolve every pair to 75/40. Labels follow the shipped metric names;
`집계 대상 없음` is the neutral denominator-zero label, not an unavailable-permission label.

Both routes remain `workspace.admin`-gated, including explicitly denied Admins. PATCH
merges supplied complete pairs under the existing singleton lock, preserves unrelated
settings, and returns every effective pair. `workspace_settings_updated.detail.changes`
adds per-metric effective `{ from, to }` pairs, once for changes and none for no-op.
Bands only change presentation; ratios, queues, links, severity and anonymity are untouched.
The Admin editor at `/admin/settings` validates/save/discard/error/retry and invalidates
all `dashboard-summary` scopes on save; failed refetch must show stale/error state.

Managed System create/PATCH/read adds proposed/new nullable `default_reviewer_actor_id` /
`default_reviewer_team_id`, XOR-or-both-null, independent of general owner and Survey
operator. Validate workspace/eligible Actor or active team, audit create snapshots/update
diffs (ADR-0017 amendment), preserve existing assignments, and expose safe Admin diagnostics
for skipped automatic defaults. Registry supplies transaction-aware inputs; destination
services resolve assignments. Existing known-team display is supported; no team CRUD,
membership, or workspace team-candidate endpoint is introduced.

## Cluster suggestion opt-in (ADR-0068; proposed/new)

The accepted close-out addition to the settings response and strict non-empty
partial PATCH is `voc_cluster_suggestions_enabled:boolean`, default `false`.
The two-field response/defaults above describe the shipped pre-ADR-0068 shape;
implementation extends the complete resolved response with this field. Both
routes still require `workspace.admin`. Preserve unspecified settings, serialize
through the singleton, and audit only effective `{ from,to }` changes through
`workspace_settings_updated`. VOC generation locks/rechecks the policy via
`getResolvedWorkspaceSettingsForUpdate`; shadow remains independent. Turning off
stops new automatic suggestions, without deleting pending/history or prohibiting
human review/confirmation. No preview quota/model/scheduling settings are added.
