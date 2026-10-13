# Core / Health / Managed System / Analytics Area

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Core / Health / Managed System / Analytics Area

```text
GET /health
GET /health/live
GET /health/ready
GET /managed-systems
GET /managed-systems/default-diagnostics
GET /managed-systems/default-candidates
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
  "survey_anonymity_threshold": 5,
  "voc_cluster_suggestions_enabled": false,
  "coverage_thresholds": {
    "voc-task": { "good_min_percent": 75, "warn_min_percent": 40 },
    "finding-execution": { "good_min_percent": 75, "warn_min_percent": 40 },
    "high-followup": { "good_min_percent": 75, "warn_min_percent": 40 },
    "released-update": { "good_min_percent": 75, "warn_min_percent": 40 },
    "analytics-area": { "good_min_percent": 75, "warn_min_percent": 40 }
  }
}
```

When no `core.workspace_settings` row exists, GET returns the baseline defaults
`permission_self_approval=allowed`, `survey_anonymity_threshold=5`, and all five
Coverage pairs at 75/40, with `voc_cluster_suggestions_enabled=false`.
PATCH accepts a strict, non-empty partial of those snake_case fields;
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

## Close-out settings and registry inputs (ADR-0067; settings editor shipped #1088, registry inputs pending)

The BE contract includes `coverage_thresholds` in the full resolved settings response and
strict nonempty partial PATCH (#1087). The Settings editor and rendered consumer compatibility
ship with #1088 in the same PR as #1087 so `no_data` is never exposed unhandled. Its exact metric IDs and pairs are in
`docs/design/15-data-contracts.md`; unknown/reserved IDs, incomplete pairs, nonintegers,
and cutoffs outside `0 <= warn < good <= 100` reject `validation.failed` without writes.
Missing rows/keys resolve every pair to 75/40. Labels follow the shipped metric names;
`집계 대상 없음` is the neutral denominator-zero label, not an unavailable-permission label.

Both routes remain `workspace.admin`-gated, including explicitly denied Admins. PATCH
merges supplied complete pairs under the existing singleton lock, preserves unrelated
settings, and returns every effective pair. `workspace_settings_updated.detail.changes`
adds per-metric effective `{ from, to }` pairs, once for changes and none for no-op.
Bands only change presentation; ratios, queues, links, severity and anonymity are untouched.
The Admin editor (#1088) at `/admin/settings` renders the five labeled pairs, validates
`0 <= warn < good <= 100` integers before save, supports save/discard/error/retry, invalidates
all `dashboard-summary` scopes on save, and Coverage offers an authorized Admin the jump to it.
On a failed summary refetch, Home and Coverage keep their cached rows under an explicit error
indication, while Integration hides its Managed System overview, omits its average-coverage
stat, and shows its explicit error (or permission-blocked) state instead of stale cells.

Managed System POST/PATCH/read includes nullable `default_reviewer_actor_id` /
`default_reviewer_team_id`, independent of owner and Survey operator. Each pair is
XOR-or-both-null. POST omission persists null; PATCH omission preserves the field;
clear-and-replace sends both keys together. Mutations require server-side `workspace.admin`,
including explicit-deny rejection. Effective no-op writes no audit; create snapshots
include both reviewer keys and updates include only effective changes. Older audit
snapshots without reviewer fields remain readable. `GET /managed-systems` stays session-only.

Registry Actor defaults require a same-workspace internal Admin/Developer eligible for
at least one intended owner workflow (`voc.triage` or `finding.manage`), or `finding.manage`
for reviewer, using current capability decisions and the declared Finding Admin bypass.
New-system registration has no existing Managed System scope, so Actor eligibility uses
workspace scope; PATCH checks the target system. Teams must exist in the workspace and
be active; neither assignment nor default grants permissions or selects members. Invalid
explicit targets reject `422 validation.failed` with the affected snake_case field path;
XOR uses `mutually_exclusive`, other codes are `foreign_workspace`, `archived_team`, or
`ineligible_actor`. PATCH validates the effective pair under the registry row lock.
Unrelated metadata edits preserve invalid old defaults so configuration can be repaired.

### Admin default Actor candidates (#1089)

`GET /managed-systems/default-candidates?managed_system_id=:uuid` requires the same
session/workspace and current `workspace.admin` authorization as diagnostics. The optional
system must belong to the workspace (`404 not_found.record` otherwise); omission uses
workspace eligibility for registration. The strict response is
`{ owners: [{ id, display_name, eligible }], reviewers: [{ id, display_name, eligible }] }`.
The server applies the same destination capability checks as POST/PATCH. Only eligible
Actors are offered, plus the currently configured same-workspace internal Actor when no
longer eligible (`eligible: false`). No emails, teams or membership are returned. GET writes
nothing. Registry pickers mark retained ineligible values, disable their selection, and
associate server `fields[].path`/category errors with the matching owner/reviewer field.
Mutation validation remains authoritative and rechecks eligibility at save time.

### Admin automatic-default diagnostics (#1089, ADR-0067 56-D)

`GET /managed-systems/default-diagnostics` requires session/workspace and a current
server-side `workspace.admin` check, including explicit denies (`403 permission.denied`).
It reads active systems in the caller's workspace and writes no rows/audits. Response:

```text
{ items: [{ managed_system_id, workflow: voc|finding|task_request|task,
  responsibility: owner|reviewer,
  rule: managed_system_owner|managed_system_reviewer|analytics_area_owner,
  category: missing|invalid_pair|foreign_workspace|archived_team|ineligible_actor,
  origin: configuration|creation_failure, count, last_failed_at: ISO timestamp|null }] }
```

Current registry owner/reviewer checks emit configuration warnings (representative VOC /
Task Request workflow respectively, count 1, timestamp null). An empty reviewer is not a
warning when the owner fallback is eligible for review (`finding.manage`, not merely
`voc.triage`). Warn when that chain is empty/broken, and always warn for a configured
ineligible/archived/foreign default even when a fallback is valid. Creation failures aggregate
by system/workflow/responsibility/rule/category. They are historical observations, not
source assignment or recovery state. No candidate/source IDs, email, title, body, Survey
response identity, or team membership is stored or returned. Only the already workspace-
visible Managed System ID is exposed. A later effective edit to the matching responsibility
pair supersedes earlier failure observations; name/external-key edits do not clear them.
Ordering uses DB `clock_timestamp()` under the registry lock: failure `created_at` is
written after the share lock, and update audit detail carries `configuration_changed_at`
(UTC with microseconds) while holding the exclusive lock. Transaction-start timestamps do
not order these operations. Historical audits without this optional marker retain their
`created_at` comparison; no schema migration or audit rewrite is required.
Current configuration is always rechecked, so a revoked Actor or archived team remains
visible. Admin Registry invalidates/refetches diagnostics after successful configuration
edits; a failed read shows a red shared Callout and retry, never an empty healthy result.
Each warning explains the skipped automatic assignment, opens that system's settings, and
marks the affected registry row. Reviewer field help explains the owner fallback; owner
and reviewer pairs render side by side to preserve registry density.

`recordResponsibilityDefaultFailure(tx, input)` is the Core-owned append seam in
`managed-systems/default-diagnostics.ts`, exported through `managed-systems/index.ts`.
Its strict shared input schema accepts only workspace/system, workflow/responsibility,
rule and category above. It validates system workspace and uses the caller transaction;
rollback removes the input. Runtime has SELECT/INSERT only on the new diagnostic table,
without UPDATE/DELETE or any new bootstrap role. #1090/#1091 supply successful automatic-
resolution failures in their source transaction, once per skipped rule, and own replay/
fallback/creation end-to-end evidence. They must recheck destination eligibility, keep
explicit-null versus omitted semantics, and never call this seam on replay or rejected
creation. #1089 supplies and tests the seam/read/UI with real fixtures; it does not install
creation-time producers itself. #1090 wires VOC and all three Finding source producers.
`lockAnalyticsArea` / `assertActiveAnalyticsAreaForManagedSystem` now return stored
`owner_team_id` in the caller transaction after workspace/system/archive validation.
Core also supplies an active-team validity input; destination eligibility remains source-owned.
Defaults never reassign historical rows; Survey's dedicated
operator routing remains unchanged. Known teams display without new CRUD, membership,
or a workspace team-candidate endpoint.

## Cluster suggestion opt-in (ADR-0068; BE/shared storage #1096)

The accepted close-out addition to the settings response and strict non-empty
partial PATCH is `voc_cluster_suggestions_enabled:boolean`, default `false`.
The complete resolved response above includes this field. Both
routes still require `workspace.admin`. Preserve unspecified settings, serialize
through the singleton, and audit only effective `{ from,to }` changes through
`workspace_settings_updated`, with strict boolean `from`/`to` values. A false
PATCH against a missing row preserves row absence. Toggling never spends counters,
advances cursors or writes suggestion/Cluster rows. The generator and Admin editor
are deferred to ADR items 2 and 3. Future VOC generation locks/rechecks the policy via
`getResolvedWorkspaceSettingsForUpdate`; shadow remains independent. Turning off
stops new automatic suggestions, without deleting pending/history or prohibiting
human review/confirmation. No preview quota/model/scheduling settings are added.
