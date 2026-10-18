# #740 canonical link and audit read cutover

ADR-0064 item 2 is implemented in journaled `0064_canonical_read_boundary.sql`
plus its Drizzle-generated snapshot, applied after 0058 Permission revisions, 0059
Survey provenance, 0060 responsibility defaults, 0061 Coverage, 0062 Cluster
suggestion storage and 0063 Permission grant reissue.

## Storage and owning seams

`core.entity_links_app` explicitly projects all 16 canonical columns, filters out
`survey_response` at either endpoint regardless of status, uses `security_barrier`
and cascaded CHECK OPTION, and is owned by `fops_entity_links_view_owner`. That owner
has raw SELECT/INSERT/UPDATE solely to support the view; app has SELECT/INSERT/UPDATE
on the view, no DELETE. Canonical table mapping remains for FKs and operator history.
The migration removes raw app/PUBLIC table/column privileges and rejects inherited
raw access. IDs, unique index, tuple checks and detached history are preserved.

Entity Links ordinary creation uses a transaction advisory lock on the complete tuple
before active lookup and INSERT RETURNING. The view has no unique index for ON CONFLICT
inference. Existing ordinary-row return, concurrency and detach/reinsert semantics
must pass the real-role command/route suites before cutover. Detach uses UPDATE RETURNING.

`createSurveyFindingLink` is Entity Links' authorized application command and calls
`core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid)`, owned by
`fops_entity_links_survey_mutator_owner`. In 0064 it allows only the current response-derived
Finding's generated_finding/evidence_of relations, validates workspace-qualified
private parent/response binding and source Managed System, and returns `{id,inserted}`.
It neither returns raw endpoints nor exposes detach. Findings authorizes both systems
before calling it and retains exact same-transaction audits/counters/idempotent replay.
0066 extends only evidence_of to approved attachment witnesses as described below.

Survey's `survey.read_derived_findings(uuid,uuid,boolean)` is addressed by workspace
and Survey ID and returns only Finding ID/target Managed System. The boolean enables
approval-free discovery only when the response cohort meets the configured threshold.
Otherwise, only responses with an active approval contribute derived Findings, preserving
shipped Results action continuity even while question aggregates remain suppressed.
Personal access alone does not enable approval-free discovery. This still discovers
zero-highlight parents without personal access for a visible cohort.

Dedicated `fops_survey_derived_finding_reader_owner` owns this reader. It has only schema
USAGE and the needed SELECT columns on canonical links, response Survey binding, active
approval binding and Finding ID/target scope; it cannot write any table or read answers,
respondent identity or excerpt text. The existing evidence reader gains no `core` usage
or link/Finding reads. Results independently checks source Survey read/draft and elevated
target Finding read/manage. Non-holders use the non-personal approved excerpt projection;
holder payload and per-row personal-read audits remain intact.

Core's `core.latest_permission_request_question(uuid,uuid)` returns only note/timestamp
for the latest matching workspace/request/subject/event (timestamp then ID order).
`core.responsibility_configuration_changes(uuid)` returns only Managed System ID,
owner/reviewer category and correction timestamp for allowlisted responsibility field
changes on managed_system_updated audits in the workspace. Existing caller authorization
and diagnostic supersession predicates remain. Both are owned by
`fops_core_audit_reader_owner`; no general audit JSON or subject reader exists.
All four functions fully qualify storage, set search_path=pg_catalog, have PUBLIC
EXECUTE revoked and explicit app EXECUTE; no function uses dynamic SQL.

## Deployment prerequisite and limitations

A privileged operator must provision the following NOLOGIN/NOINHERIT roles and one-way
migrate memberships before this migration on an existing database (fresh bootstrap is
`scripts/db/init.sql`). Inspect existing attributes/memberships/grants before reuse.

```sql
CREATE ROLE fops_entity_links_view_owner WITH NOLOGIN NOINHERIT;
CREATE ROLE fops_entity_links_survey_mutator_owner WITH NOLOGIN NOINHERIT;
CREATE ROLE fops_core_audit_reader_owner WITH NOLOGIN NOINHERIT;
CREATE ROLE fops_survey_derived_finding_reader_owner WITH NOLOGIN NOINHERIT;
GRANT fops_entity_links_view_owner TO fops_migrate;
GRANT fops_entity_links_survey_mutator_owner TO fops_migrate;
GRANT fops_core_audit_reader_owner TO fops_migrate;
GRANT fops_survey_derived_finding_reader_owner TO fops_migrate;
```

Migration rejects privileged/inheriting/login owners, missing migrate membership,
app owner membership and reverse migrate membership. Do not give app owner membership
or restore raw grants. Keep the #1060 prerequisite and coordinated old-binary stop/deploy
window with 0059. No history deletion or audit Actor/detail redaction is authorized.

Production consumers inventoried: Entity Links repository, Findings creation/read,
Tasks source/detail, Dashboard recovery/Coverage, VOC Clusters linked Findings, VOC list
linked/follow-up predicates, Survey Results and Core question/Managed System diagnostics.
Milestones continues through existing module seams. Audit append stays INSERT without
RETURNING. Canonical fixture/reset/teardown and history queries remain migrate-owned.
Repository inventory cannot establish external SQL clients or deployed role state;
conductor must inventory those before revocation.

Application-permitted definer composition remains the accepted O1-A limit. Neither
this cutover nor 0059 claims SQL unlinkability under stolen application credentials.

## Verification

Run the entire affected modules and full integration gate on a throwaway database
with real app/migrate roles. Required paths include:

- DB role-grants and canonical-read-boundary: effective raw/column denials, view/PUBLIC/
  owner/membership/function ACLs, CHECK OPTION, no DELETE and retained all-status history.
- Entity Links commands/routes: ordinary INSERT/duplicate/concurrency/rollback/detach/
  reinsert, filtering before limit, opaque Survey list/count/cursor/detach across actors.
- Findings Survey creation/evidence and Survey Results/evidence/follow-up: zero-highlight
  discovery, source/target/personal/elevated/draft/cohort gates, exact history/counters/
  audits, denied zero mutation and replay. Existing #739 revoke/read races remain required.
- Permission selected-read latest-question ordering/authorization and Managed System
  diagnostic correction/unrelated edits/rollback semantics, including #1085 new observers.
- Tasks, Dashboard, VOC, Clusters, Coverage and Milestone ordinary route regressions;
  audit/link history observers use migrate while routes still boot as app.
- Full static gates and local rendered 1440/visual verification.

The previously documented #739 standalone upgrade harness is absent; a real-role
legacy upgrade/history check remains a standing gap to restore/replace and execute.
See `survey-provenance-cutover-739.md`. Migration execution, deployed
ACLs, inherited role state, SQL view behavior and concurrency remain runtime-verification
requirements; TypeScript success alone proves none of them.

## #1109 approved attachment extension (0066)

`0066_survey_evidence_attachment.sql` is a Drizzle-generated custom migration with
journal and snapshot. It reuses both existing isolated mutator owners; no new role,
app table/column privilege, app owner membership or reader-owner extension is added.
The migration adds precisely these effective privileges:

| Owner | Object | Privilege and purpose |
| --- | --- | --- |
| `fops_entity_links_survey_mutator_owner` | `survey.highlight_response_bindings` | SELECT `(workspace_id, highlight_id, response_id)` to verify the private attachment witness |
| `fops_entity_links_survey_mutator_owner` | `finding.evidence_highlights` | SELECT `(id, workspace_id, finding_id, source_type)` to bind that witness to its Survey highlight and target |
| `fops_survey_provenance_mutator_owner` | schema `core` | USAGE to execute deferred canonical-link consistency checks |
| `fops_survey_provenance_mutator_owner` | `core.entity_links` | SELECT `(workspace_id, source_type, source_id, target_type, target_id, relation_type, status, visibility)` to require the exact active internal-only evidence tuple |
| `fops_app` | `survey.lock_attachment_response(uuid,uuid)` | EXECUTE only; resolve a workspace-bound approval internally and take the existing response advisory lock |

The existing `core.create_survey_finding_link(uuid,uuid,uuid,text,uuid,uuid)` app
EXECUTE is reaffirmed. PUBLIC EXECUTE is revoked. The new function has
`search_path=pg_catalog`, qualified storage and no dynamic SQL. Temporary schema
CREATE for ownership transfer is revoked in the same migration transaction.
CREATE OR REPLACE retains the existing owners and ACLs of the consistency functions.

The link command now accepts `evidence_of` backed by a same-workspace private
highlight binding; `generated_finding` still requires the original private parent
binding. The 0059 deferred checks permit an attached response different from that
original response only with an active internal-only `evidence_of` for the attached
response and target. Original parent bindings and protected snapshots remain immutable.

Findings locks and authorizes the target before Survey selection resolution.
Survey locks the workspace settings singleton (including default-row initialization)
and response, then rechecks source access, draft state, active approval, cohort and
text-question suppression. Highlight, protected snapshot, count, canonical link,
identifier-only audits and metadata-only idempotency cache commit together.
Safe candidate reads use repeatable-read snapshots and actual result aggregates;
they never invoke audited personal Results. Existing reader/aggregate/view/audit
owners receive no privileges, and raw app link/audit reads remain forbidden.

Apply 0066 and run the real-role ACL, deferred consistency, attachment,
rollback, replay, revoke and settings-threshold race tests plus existing personal
creation/approval, ordinary VOC/note, linked-highlight and inventory regressions.
Typechecking those tests does not establish runtime SQL or deployment success.
