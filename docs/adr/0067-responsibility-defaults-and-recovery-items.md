# ADR-0067: Responsibility defaults and Dashboard recovery items

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions)

Supersedes ADR-0059 D1/D3 deferrals and the automatic-default rejection clauses in
`docs/design/09-permission-access.md`, `docs/implementation/03-api-contracts.md`, and
`docs/implementation/05-permission-policy.md`. Amends ADR-0017's registry inputs;
retains ADR-0018/0044's team administration boundary, ADR-0045's optional VOC owner,
ADR-0026's review authority, and ADR-0055's Survey-owned follow-up exception.
This is an accepted implementation contract, not a claim that the features ship today.
All additions labeled proposed/new below require implementation issues.

## Context

At about 5k VOCs and 5k Tasks, count-to-list navigation does not explain a specific
workflow gap, and stored defaults that creation ignores do not route work. A revoked
routing default must not prevent an internal reporter submitting a VOC. Operators need
real responsibility, a bounded queue, the exact next step, and trustworthy recent history.

Inputs: local `D-56-MEMO.md` §§3–6 (design memo, not a repository contract), and the
owner's 2026-10-13 approval comments on [#1044](https://github.com/hjung3113/FeedbackOps/issues/1044),
[#1045](https://github.com/hjung3113/FeedbackOps/issues/1045), and
[#1046](https://github.com/hjung3113/FeedbackOps/issues/1046). The owner approved all
recommendations: 56-1/O1 through 56-5/O5 and all six D3 capabilities within the memo's
bounds. The engineering decisions below retain memo §4, with one ADR rather than its
two unnumbered proposals, and adopt its proposed performance limits as acceptance
requirements. No runtime or performance result is implied.

## Decision

### 1. Five Coverage bands and honest empty data (56-1/O1, 56-2/O2)

Each emitted metric (`voc-task`, `finding-execution`, `high-followup`,
`released-update`, `analytics-area`) gets its own good/warn pair, initially 75/40.
Different jobs can have different standards without making neglected follow-up healthy.
Keep ratios, predicates, integer percentage rounding, severity, and queue counts unchanged.
The reserved `milestone-outcome` metric remains omitted.

Proposed/new `core.workspace_settings.coverage_thresholds` is a bounded JSON object
of exactly those five IDs, each `{ good_min_percent, warn_min_percent }`. Integers must
satisfy `0 <= warn_min_percent < good_min_percent <= 100`; unknown/reserved IDs reject.
Missing settings rows/keys resolve to 75/40 for rollout. Admin PATCH accepts a nonempty
partial map of complete metric pairs, merges under the existing singleton lock, preserves
unrelated settings, and returns all resolved values. Strict API/audit parsers must include
per-metric effective from/to changes in `workspace_settings_updated.detail.changes`;
a no-op has no mutation/audit. Read settings once per summary and use the same lookup on
roll-up, Managed System, and Analytics Area cells.

For total zero retain value/total/numeric percent (zero), with proposed/new server status
`no_data` and neutral `집계 대상 없음`. Permission-unavailable metrics remain omitted/`—`;
they are not zero/no-data. For nonempty totals, good >= good cutoff, warn >= warn cutoff,
otherwise bad. `/admin/settings` edits the pairs; Home, Coverage, and Integration display
them. Saving invalidates every `dashboard-summary` scope; failed refetch retains an honest
stale/error indication. An authorized Admin may jump from Coverage to Settings.

### 2. Source-owned responsibility and fallback (56-3/O3, 56-4/O4)

Responsibility is an Actor or an active same-workspace team, never both. It grants no
permission, selects no arbitrary team member, and changes no workflow status. Keep
existing assignments unchanged on rollout/default edits; never backfill from provenance.

| Workflow | Actual responsibility | Creation state |
| --- | --- | --- |
| VOC | Existing `voc.vocs.owner_user_id` / `owner_team_id` | `untriaged` |
| Finding | Proposed/new `finding.findings.owner_actor_id` / `owner_team_id` | Existing source creation state, normally `draft` |
| Task Request | Proposed/new `task_request.task_requests.assigned_reviewer_actor_id` / `assigned_reviewer_team_id` | `pending_review`; `reviewer_actor_id` stays null until a real decision |
| Converted Task | Existing `task.tasks.assignee_actor_id` / proposed/new `assignee_team_id` | `backlog` |

All pairs allow both null and otherwise enforce XOR, workspace and active-team validation.
`created_by` is provenance; `reviewer_actor_id`, `decided_at`, and `decision_reason` record
an actual review, not an assignment. Existing completed decisions remain intact.

Resolution order in each destination application service:

1. Permitted explicit Actor/team value; authorized explicit null intentionally leaves work
   unassigned and skips defaults. Omission requests automatic resolution.
2. Managed System target: owner workflows use its owner pair. Task Request uses proposed/new
   `default_reviewer_actor_id` / `default_reviewer_team_id`, then the general owner if eligible.
3. Active Analytics Area owner team within the destination's same Managed System.
   For Task Request, obtain source classification through the source-owned read seam;
   no new Task Request Analytics Area column is implied.
4. Existing authorized scoped operational queue, with actual responsibility fields null.
   `workspace_fallback_queue` names that routing outcome, not a new permission or team.

Invalid explicit input rejects with `validation.failed` (including simultaneous Actor/team,
foreign workspace, archived team, or ineligible Actor). An absent/invalid automatic candidate
falls through to the next rule; ultimately creation succeeds unassigned with an Admin-visible
configuration warning. This preserves intake instead of losing work to setup failure.
Ordinary VOC reporters still cannot provide owner input; a privileged override must be
checked server-side with `voc.triage`. No extra reporter form fields are required.

Concrete Actor eligibility uses the destination's current authority: `voc.triage`,
`finding.manage`, or the Admin-or-scoped-Developer `finding.manage` seam for Task Request
review/Task management. Preserve each module's Admin bypass and explicit-deny semantics;
a role label alone is insufficient. Validate expiry/revocation inside the transaction.
**Amendment 2026-10-15 (#1172):** A concrete VOC owner must be an active internal
Actor (an `internal_member` row in the workspace) with effective `voc.triage`
**and** `voc.read` in the VOC's Managed System. Apply the same deny-first,
transactional expiry/revocation checks to explicit creation, automatic defaults,
changed triage ownership and owner candidates. Teams remain unchanged. Do not
reassign historical records or reject unrelated edits because a stored owner
became ineligible.

Team responsibility requires active same-workspace validity and grants no member access.
Assignment never confers `task_request.self_approve`; other authorized reviewers retain
access to the shared queue. Send existing Task assignment notifications only to a concrete
Actor, once under idempotent replay; invent no team-member notifications.

Core-owned Managed Systems/Analytics Areas expose transaction-aware routing inputs through
approved seams, extending `lockManagedSystem` and owned readers. Destination services own
eligibility, assignment writes, audit, links, and idempotency in one transaction. Shared
contains DTO/schema only. Survey's explicit operator → dedicated Managed System Survey
operator → creator rule and validation/audit stay unchanged.

Creation responses and existing creation audits carry safe proposed/new `default_resolved`,
`source_rule`, `managed_system_id`, and persisted responsibility. A valid automatic target
sets `default_resolved=true`; explicit/null/fallback sets false. Record a configured-but-invalid
skipped candidate regardless of the final outcome; record an empty (`missing`) skipped
candidate only when creation ends at `workspace_fallback_queue`. Record the fallback
outcome without leaking private candidate IDs to a Reporter.
Admin diagnostics must make failed defaults discoverable alongside registry configuration;
null-and-forgotten is not an acceptable fallback. Source fields remain current truth.
Wire VOC create, VOC/Cluster/Survey-response Finding creation, Finding/VOC/Cluster Task
Requests through their common command, and approved-request Task conversion. Ship source
assignment display/edit/filter behavior with these fields. Home uses the actual assigned
reviewer filter, not all pending requests; team responsibility does not invent personal
membership. Operational totals remain scope-wide.

### 3. All six D3 capabilities (56-5/O5)

| Capability | Kept decision and product value |
| --- | --- |
| `recovery_item_id` | Stable opaque identity shared by Home/Integration so bookmarks, hiding, and history refer to one gap. |
| Detail panel | Compact reason, safe affected summaries, backend actions and gated source jumps explain the repair at scale. |
| Snooze/mute | One-day/seven-day snooze and mute of the current occurrence reduce repeated noise; hidden view/restore prevents lost work. |
| Three-month history | Cursor-paged safe resolution metadata explains completed work and reopened gaps without creating a reporting platform. |
| `computed_at` | Server computation time and last successful refresh disclose age while a tab stays open or refresh fails; no new cache required. |
| `responsible_actor_hint` | Derived safe Actor/team/unassigned/multiple-responsible hint helps contact the right owner without another assignment system. |

Use only the six emitted categories and their current predicates:

| Category | Grain / boundary |
| --- | --- |
| `unassigned-voc` | One VOC |
| `high-severity-unlinked` | One VOC; preserve actual qualifying follow-up predicate |
| `actionable-finding-no-execution` | One Finding |
| `released-task-unresolved-voc` | One Task, even with multiple unresolved linked VOCs |
| `permission-requests-pending` | One Permission Request, workspace-level Admin review |
| `bad-outcome-no-followup` | Existing aggregate count; Survey-owned response adapter under ADR-0055 |

Proposed/new endpoints: `GET /dashboard/recovery-items`,
`GET /dashboard/recovery-items/:id`, `GET /dashboard/recovery-history`, and
`PATCH /dashboard/recovery-items/:id/presentation`. Category, effective
`managed_system_id`, cursor, and limit filter lists; default 50, max 100. Apply current
scope/category/presentation predicates before LIMIT/count, with deterministic cursor order.
The presentation PATCH derives Actor from session and only accepts own snooze/mute/restore,
not Actor override, owner, resolution, or domain mutation fields. Queue responses separate
visible and personally hidden totals; operational summary counts ignore personal hiding.
Home's item view is actionable-by-me now; summaries stay capability-specific scope unions.

Identity is unique by workspace + category + source. Different categories on one source
are different identities. Proposed/new Dashboard-owned identity, occurrence/history, and
Actor/identity/occurrence presentation storage are read projections. A source repair alone
resolves a gap; there is no generic dismiss/resolve endpoint. Detail includes current
active/resolved/withdrawn state, occurrence, backend priority/severity/reason, permitted
source identity/routes, safe affected summaries/actions, derived hint, and presentation.
Unknown/foreign/unreadable identities share `404 not_found.record`. A readable resolved
selection stays open with metadata and no stale repair action. Restricted VOCs linked to
a readable Task do not disclose their titles, routes, or actions. For multiple VOC owners,
return multiple-responsible rather than arbitrarily choosing one; omit email and unsafe IDs.

Inject a proposed/new Dashboard-owned transaction-aware recorder into source/link commands
without runtime cycles through command barrels. After successful mutation, reevaluate the
same authoritative predicates through approved read seams; lock/deduplicate by identity and
record a real transition with safe audit/action references in the same transaction.
Rollback/no-op/replay writes no duplicate resolution. Resolve→reopen increments occurrence,
retains prior history, and resets personal hiding, even between scans. Permissions lost are
not resolution; archive/policy withdrawal is separately labeled.

Use existing pg-boss for initial discovery and idempotent reconciliation (ADR-0009).
Reconciliation repairs drift and records observation time without inventing a deciding
Actor or exact action timestamp. Generic GETs write no source/projection state or audit;
required personal Survey read audits remain. Rollout starts truthful tracking and seeds
active identities without fabricated past resolutions. History covers three calendar
months by resolution time. It stores no raw body/respondent identity/private comment and
rechecks present permissions and source visibility on every read, including historical
summaries/action references. Projection pruning never deletes indefinite `core.audit_log`
(ADR-0008), stable identities, or the current occurrence needed for presentation.

**Outcome Survey exception:** retain ADR-0055's closed/threshold/low-band classifier;
only a qualifying current `generated_finding` or `no_follow_up` clears its response gap.
Dashboard keeps the authorized aggregate count and safe Survey-level navigation. Response
identity, decisions, reopen commands, personal disclosure audits, and per-response
presentation/history stay Survey-owned behind `survey.read` then explicit
`survey.read_personal_responses`, with no Admin bypass. Non-holders get Survey-level
booleans, no response IDs/opaque response-derived identities, per-Survey response counts,
raw answers, or per-response presentation/history enumeration. A Dashboard projection may
reference the gated Survey adapter; it never duplicates decision state or circumvents the
personal seam. Response → Task Request remains unsupported; go through a Finding.

### 4. UI ownership, freshness, and performance

Integration owns shared recovery feature code with a proposed/new explicit public surface
for Home. Extend existing `/integration` and `/home` route composition; Coverage entry
points may link into the same recovery identity. Preserve the three shells (ADR-0020),
shipped UI patterns (ADR-0060), Korean chrome/domain nouns (ADR-0057), and URL scope,
category, selected identity, personal hidden/history view, and safe return intent. Restore
selection after refresh/back; keyboard selection/Escape returns focus; source jumps preserve
queue context. No source workflow is duplicated inside the compact panel.

Keep `getSummary` bounded; add one proposed/new `computed_at` to its strict schema and
show the last successful refresh on Home/Coverage/Integration. Time means projection
computation, not an atomic database snapshot. Repair refreshes active queue/detail/summary
and affected source queries; React cannot infer resolution from link presence.

Acceptance budget, adopted from memo §4: on identical throwaway datasets of about 5k VOCs
and 5k Tasks, warm summary/list/detail API p95 <= 500ms; summary p95 also <= develop p95
× 1.2 + 50ms. Record median/p95 across several scopes/system counts. Existing UI regression
threshold remains median `readyMs > develop × 1.2 + 50ms`, a reload, or two extra API calls
(`.claude/skills/issue-wave-conductor/templates/review-rules-perf.md`). Measure recorder
mutation latency and multi-VOC fanout too. Group per-system reads if the baseline fails,
batch labels/readability by distinct system, and index active workspace/scope/category,
history `(workspace_id, resolved_at, id)`, and source/Actor identity keys. EXPLAIN representative
joins; no unbounded rows or per-item query growth. These are required checks, not measured
results; the conductor owns the dataset, browser/visual checks, and full gates.

## Alternatives rejected

- One global band pair and red empty-denominator status obscure different operational
  standards and confuse a new workspace with failed work.
- Rejecting invalid automatic defaults prevents VOC intake; accepting invalid explicit
  assignments would hide an operator error. Use fallback only for automatic routing.
- Actor-only persistence leaves configured team defaults ineffective. Selecting a member
  or granting permission invents authority; persist the team itself.
- Indefinite identity-wide mute loses reopened work. Hide only this occurrence.
- Independent Dashboard resolution or a generic response queue creates a second truth
  and bypasses Survey privacy; retain source commands and the Survey adapter.

## Non-goals and consequences

No per-system Coverage overrides/new ratios, new queue wishlist categories, milestone-outcome
metric, team CRUD/membership/candidate listing, automatic reassignment, standalone Task
creation, new workflow/self-approval permissions, shared snooze, chart/trend platform,
cache solely for timestamps, fabricated pre-rollout history, audit retention change, or
replacement orchestrator. Deferrals and reopen conditions live in
`docs/design/14-post-mvp-backlog.md`. Defaults/fields/projections require schema, strict
parsers, audits, and UI in matching implementation chunks. This docs-only ADR changes no
running code, migration, configuration, or shipped acceptance evidence.

## Implementation issues

The conductor files these ordered chunks; names below are proposed issue titles, not
existing issue numbers. Every implementation PR updates its affected contracts and runs
tests at the public seams; the conductor runs the full gate and applicable visual checks.
Paths below exist; any additions within them are proposed/new.

1. **56-B — Persist and consume five Coverage bands** (BE; dependency: ADR-0067).
   Files/modules: `apps/backend/src/db/schema/core.ts`, `apps/backend/migrations/`,
   `apps/backend/src/modules/workspace-settings/`, `apps/backend/src/modules/dashboard/service.ts`,
   `packages/shared/src/dashboard.ts`, `packages/shared/src/audit/workspace-settings.ts`.
   Acceptance: real Admin/Developer/User/denied-Admin routes; defaults, invalid/unknown/reserved
   pairs, partial/concurrent merge, effective audit/no-op; same metric bands at every grain;
   neutral total-zero, absence distinct, unchanged counts/links/anonymity/source audits.
2. **56-C — Settings editor and consistent Coverage states** (FE; dependency: B).
   Files/modules: `apps/frontend/src/features/admin/settings/`, `apps/frontend/src/features/home/`,
   `apps/frontend/src/features/integration/`, `apps/frontend/src/lib/copy/coverage.ts`;
   proposed/new copy module `apps/frontend/src/lib/copy/workspace-settings.ts` if needed.
   Acceptance: five labeled pairs, validation/save/discard/error/retry, server block, all-scope
   cache invalidation/refetch, stale failure, neutral no-data/omitted metrics, existing hops/URL,
   desktop 1440 rendered/visual checks.
3. **56-D — Responsibility fields and registry defaults** (BE + Admin FE; dependency: ADR).
   Files/modules: `apps/backend/src/db/schema/{core,finding,task-request,task}.ts`,
   `apps/backend/migrations/`, `apps/backend/src/modules/managed-systems/`,
   `packages/shared/src/audit/managed-system.ts`, `apps/frontend/src/features/admin/managed-systems/`.
   Acceptance: XOR/workspace/active-team rejection, unchanged historical nulls/decision Actor,
   reviewer versus owner inputs, authorized edit/audit and denial, warning diagnostics,
   unchanged Survey rule, known team display without new membership/CRUD.
4. **56-E — Resolve VOC and all Finding source responsibility** (BE + source FE; dependency: D).
   Files/modules: `apps/backend/src/modules/voc/commands/create.ts`, VOC repo/DTO,
   `apps/backend/src/modules/findings/{creation,commands,repo}.ts`,
   `apps/backend/src/modules/voc-clusters/conversion.ts`, shared schemas/audits, corresponding
   `apps/frontend/src/features/{voc,findings,surveys,voc-cluster}/` consumers.
   Acceptance: User intake/no forged override, real assigned-but-untriaged VOC; Actor/team,
   explicit/null/omitted, MS/AA/fallback and revoked/foreign cases; all three Finding sources,
   target-system eligibility, personal source gate before target disclosure, atomic audit/links,
   rollback/replay, source-owned edit/filter/display.
5. **56-F — Assigned reviewer and converted Task responsibility** (BE + Tasks/Home FE;
   dependency: D; can proceed alongside E).
   Files/modules: `apps/backend/src/modules/task-requests/{service,repo}.ts`,
   `apps/backend/src/modules/tasks/service.ts`, shared DTO/query/audit schemas,
   `apps/frontend/src/features/tasks/`, `apps/frontend/src/features/home/`.
   Acceptance: three pending request sources, assigned versus actual reviewer, open authorized
   review queue/no self-approval grant, explicit/default/null/team Backlog conversion/provenance,
   atomic rollback/replay and one concrete notification; real reviewer filter/personal Home,
   source assignment edits/audits, scope-wide operational counts.
6. **56-G — Recovery identity, live queue/detail, responsibility hints** (BE; dependency: ADR
   plus E/F for final hints).
   Files/modules: `apps/backend/src/modules/dashboard/{service,repo,routes,index}.ts`,
   `apps/backend/src/db/schema/` and `apps/backend/migrations/` (new projection assets),
   approved source readers and `packages/shared/src/dashboard.ts`; Survey safe adapter.
   Acceptance: Admin/scoped Developer/no-scope User/denied/foreign cases, stable ID/distinct
   categories, count-grain predicate parity before paging, linked source redaction, current
   actions/resolved panel, Survey non-holder protections/personal read audits, GET no writes.
7. **56-H — Personal presentation and calendar-month history** (BE; dependency: G).
   Files/modules: Dashboard proposed/new storage/recorder/jobs under
   `apps/backend/src/modules/dashboard/`, source/link dependency wiring, schema/migration/grants,
   Survey-owned gated adapter.
   Acceptance: own-session hiding only/tampered Actor rejected; operational totals/source audits
   unchanged; atomic repair/history, rollback/no-op/replay; resolve→reopen between scans resets
   hiding; permission loss/archive distinguished, calendar boundary/current permissions,
   restart/idempotent reconciliation/truthful rollout, immutable audit retained.
8. **56-I — Shared recovery navigation and scale verification** (FE + performance;
   dependency: G/H and C consumer changes).
   Files/modules: `apps/frontend/src/features/integration/` (proposed/new public recovery seam),
   `apps/frontend/src/features/home/`, `apps/frontend/src/routes/_authed/integration/`,
   `apps/frontend/src/lib/copy/`, existing rendered/visual suites and conductor perf workflow.
   Acceptance: keyboard/Escape/back/refresh scope/category/selection/return restoration, safe
   reasons/actions/jumps, loading/blocked/error/resolved selection, snooze/mute/hidden restore,
   history/reopen, correct cache refresh, desktop 1440 visual/code/UX review; first-time Developer
   repairs one real gap on bounded pages; same 5k dataset median/p95/query plans and recorder
   fanout satisfy §4 without N+1. Conductor gates before delivery.
