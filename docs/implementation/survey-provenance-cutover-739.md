# #739 Survey provenance cutover contract

ADR-0064 item 1 is implemented by `0059_survey_finding_provenance.sql`; the cutover
shipped with the coordinated #740 delivery in v1.0.0.

## Protected storage and #740 integration

Survey owns `survey.finding_response_bindings` and `survey.highlight_response_bindings`.
Finding owns the public parents, their status and counters. The runtime role has no
SELECT/INSERT/UPDATE/DELETE on either extension. Existing #569 approval column ACLs
remain unchanged. Raw link/audit ACL changes and Results discovery replacement belong
to #740, which must serialize its edits to `repo-evidence.ts`, Finding creation/read
repositories, `scripts/db/init.sql` and migration metadata against this work.

- Finding binding: `workspace_id`, primary key `finding_id`, `response_id`,
  `historical_generated_title`, `historical_generated_summary`. Original legacy title
  is retained privately because cutover regenerates titles from the approved-question
  allowlist too. Includes archived and zero-highlight parents.
- Highlight binding: `workspace_id`, primary key `highlight_id`, `response_id`,
  `approved_excerpt_id`, `approved_excerpt_snapshot`. Revoked approvals and their exact
  historical snapshots remain recoverable through migrate.
- Composite FKs: `finding_bindings_parent_fk`, `highlight_bindings_parent_fk` reference
  public `(workspace_id,id)` and cascade on parent deletion for migrate-only teardown;
  `finding_bindings_response_fk`, `highlight_bindings_response_fk` reference response
  `(workspace_id,id)`; `highlight_bindings_approval_response_fk` references approval
  `(workspace_id,response_id,id)`. Response/approval deletion is restricted by history.
- Workspace-first indexes: `finding_bindings_workspace_response_idx`
  `(workspace_id,response_id,finding_id)`, `highlight_bindings_workspace_response_idx`
  `(workspace_id,response_id,highlight_id)`, `highlight_bindings_workspace_approval_idx`
  `(workspace_id,approved_excerpt_id)`. Parent lookups require matching workspace;
  `finding_bindings_workspace_parent_uq` and `highlight_bindings_workspace_parent_uq`
  uniquely index `(workspace_id,finding_id)` and `(workspace_id,highlight_id)`.
  Supporting public uniques are `findings_workspace_id_uq`,
  `evidence_highlights_workspace_id_uq`, `survey_responses_workspace_id_uq` and
  `excerpt_approvals_workspace_response_id_uq`.
- Deferred consistency triggers require exactly one extension per applicable parent,
  no extensions on ordinary parents, consistent Survey-parent response bindings and
  highlight/parent workspace and target-system equality. Mutation functions also
  validate response/Survey/approval/question membership transactionally.

Reader owner: existing `fops_survey_evidence_reader_owner`, with only required new
column SELECTs and Finding-schema USAGE; no additional writes. Mutator owner:
`fops_survey_provenance_mutator_owner`, NOLOGIN/NOINHERIT, with only required schema
USAGE, column SELECTs and INSERT on its two extensions. It owns the two mutators and
consistency trigger functions. Neither app membership nor reverse migrate membership
is permitted; no aggregate-owner writes are added. Temporary schema CREATE for
ownership transfers is revoked before the migration ends. PUBLIC EXECUTE revocation
and explicit app EXECUTE are installed in the migration transaction.

| Function | Arguments | Return | Owner |
| --- | --- | --- | --- |
| `survey.bind_finding_response` | workspace UUID, local Finding UUID, response UUID | local Finding UUID | mutator |
| `survey.bind_highlight_response` | workspace UUID, local highlight UUID, response UUID, exact approval UUID | local highlight UUID | mutator |
| `survey.read_finding_highlight_evidence` | workspace UUID, local Finding UUID, local highlight UUID array | highlight_id, source primary_managed_system_id, survey_type, survey_display_id, identity_protected, question_label, approved_excerpt_snapshot | reader |

The reader returns neither response nor approval UUID. Findings checks target read
inside the read transaction; Survey's `resolveFindingSurveyHighlights` checks fresh
`survey.read` for each source system before serializing returned text. It does not
require personal response access or result-picker suppression. Draft, revoked and
source-denied evidence omits quote, retains local/classification metadata and uses
the existing wire fallback `Survey response · Unknown · Identity protected`.
No public NULL binding fields become wire keys; shared schemas already support this.

All definers fully qualify tables, set `search_path=pg_catalog`, and use no dynamic
SQL. They are trusted application tools. A stolen app credential can still compose
permitted Survey readers; SQL-level unlinkability is not claimed.

## Lock and response contract

Create takes Core actor/key idempotency lock, then Survey response evidence advisory
lock `hashtextextended(response UUID text,0)`, then target Managed System/Area locks,
new Finding/binding and highlight/binding writes, links, counters, audits and cache.
Approved snapshot lookup and both mutators share that transaction-scoped response lock.
Revoke uses the same response lock. Batch read acquires distinct response UUID locks
in ascending UUID order, then reads exact active approval/private snapshot in a fresh
statement after waiting, and checks source authorization before returning. Target
read is in the same transaction. No stale quote is taken from a public parent row.

Metadata summary is `Survey response from <type> · <display ID>`. Title uses the
approved selected question label, or `Survey response` with zero excerpts, followed
by type/display ID. List/detail/provider summaries and Task Request defaults consume
that persisted metadata. VOC/Cluster provenance and ordinary VOC/note text remain
public under their established authorization policies.

## Existing-database prerequisite and controlled rollout

A privileged operator must run the following once before 0059; `fops_migrate` cannot
create roles. Empty databases use the updated `scripts/db/init.sql` bootstrap.

```sql
CREATE ROLE fops_survey_provenance_mutator_owner WITH NOLOGIN NOINHERIT;
GRANT fops_survey_provenance_mutator_owner TO fops_migrate;
```

If the role already exists, inspect its attributes, memberships and grants before
using it; do not blindly alter or widen them. The migration fails early when either
owner is absent, privileged/login/inheriting, migrate membership is absent, app
membership exists, or an owner has reverse membership in migrate.

Stop incompatible old binaries during the coordinated #739/#740 rollout. Provision
roles, deploy compatible binaries, apply both journaled migrations in the controlled
window, then run combined grants/routes/history/gates. 0059 locks public parents,
Survey sources/approvals/questions and idempotency rows during cutover. It validates
legacy orphan/workspace/approval-response consistency before moving history, then
clears public copies and installs checks/functions/ACLs. IDs, timestamps, counters,
approvals, canonical links and audits are preserved. Rollback after new writes
requires a reviewed forward repair; an old binary cannot use the new public NULL shape.

## Cache inventory and one-time sanitization

`creation.ts` caches Finding DTOs; `record.ts` caches status/link Finding DTOs. Both
have root `id`, `workspace_id`, `source_type`, `title`, `summary`. Task status responses
in `tasks/service.ts` carry `source.finding` resolved in `tasks/repo.ts`, with local
Finding `id`, `title`, `summary`. Typed Entity Link provider DTOs use `source_summary`
and `target_summary` with `type='finding'` and local Finding ID. Generic link-evidence
mutations return only `{id,relation_type}`; Task Request mutations cache authored
Task Request DTOs, not generated Finding source summaries.

0059 sanitizes only these named shapes whose local Finding ID resolves to a
workspace-qualified protected Survey parent in the cache Actor's workspace, including
archived parents. Root DTOs also require their Survey classification/workspace; nested
Task/provider copies require their known body context. Only generated title/summary
and any old root response ID copy change. Actor/key/hash/status/created_at and all
unrelated/authored bodies remain unchanged. Core runtime replay semantics are unchanged.

## Conductor verification procedure

Normal post-cutover route suites run through the repository integration gate on a
throwaway DB as real `fops_app`/`fops_migrate`; run the whole touched Findings, Surveys
and DB modules. The worker does not execute these suites or the migration.

The previously named `apps/backend/src/test-support/survey-provenance-upgrade.ts`
harness is absent. Its old command must not be treated as executable verification.
The conductor must restore or replace a standalone real-role legacy upgrade/history
check on an empty dedicated throwaway database, outside Vitest global setup. Cover
active/archived and zero-highlight parents, active/revoked approvals, exact private
history, named cached DTOs, unrelated cache controls, rejected inconsistent legacy
history with rollback, and post-cutover command replay without duplicate links/audits.
Use the journaled `0059_survey_finding_provenance.sql` and preserve the permission
revision migration at 0058. Provision the #1060 owners first, stop incompatible old
binaries, and coordinate the 0059/#740 deployment window. Until a replacement exists
and executes, upgrade/history verification remains an explicit release gap.

Concurrency tests use real app transactions and observed `pg_locks` wait queues for
both read-before-revoke/revoke-before-read and create-before-revoke/revoke-before-create
serializations. Actual execution is still required; static/typecheck success does not
prove migration SQL, lock queue behavior or real role ACLs.

Rendered checks: `FullFindingDetail.tsx`, `EvidenceHighlights.tsx`
and its test, `FindingRequestTaskDraftHost.tsx`, `SurveyResultsSummary.test.tsx` and the
existing URL-selected Finding detail. Check active/unavailable text, useful metadata,
Task Request defaults, Korean chrome/English nouns and desktop 1440 visual evidence.
No new picker/Evidence surface, #1052 lifetime change or library change is included.
