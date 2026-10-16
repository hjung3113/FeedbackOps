# ADR-0069: Analytics Area report attribution and safe metric grain

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions)

Implemented in Slice 59 (2026-10-15): I1 → #1077 (PRs #1161, #1162), I2 → #1078 (PR #1163),
I3 → #1079 (PR #1164). Numbers 0064–0068 are reserved for other close-out slices.
Amends ADR-0055 only for the new Area report's output grain; its response classifier,
commands, source review, storage and existing summary queue remain unchanged.

## Context

[Issue #1049](https://github.com/hjung3113/FeedbackOps/issues/1049) asks which Area needs
operational attention and a short path to the work explaining the number. The owner comment
on 2026-10-13 approves all recommendations in D-59, including decisions 59-1 through 59-3.
The decision input is the owner-approved local design memo `.review/wave/D-59-MEMO.md`
(in the conductor checkout; not a repository contract).

Coverage currently has VOC-only Area rows. Classification and links are optional; Task Request
has no direct Area and Survey response metrics can expose protected segments. Attribution and
safe output grain are architectural boundaries: changing them later would change the meaning
of saved links, reports and authorization across four owners.

## Decision

### Owner decisions (final)

| Decision | Accepted choice | Product value and rejected alternative |
| --- | --- | --- |
| 59-1 / O1 | Admin and same-scope Developer operational review; source capabilities limit every metric/action. | Daily triage, handoff and follow-up become reachable; a Reporter-facing report needs separate disclosure design without serving this job. Users retain existing own-work/public-safe surfaces. |
| 59-2 / O2 | Integration → Coverage → `Analytics Area별 현황` tab, with a secondary link from the existing Integration Coverage card. | Reuses a familiar scope/partial-coverage surface. No new `/integration/analytics-areas` route or Admin report entry; catalog administration stays `/admin/analytics-areas`. |
| 59-3 / O3 | Only directly classified VOC/Finding/Task/Survey objects have Area totals. Task Request review stays Managed System context. | Avoids guessed attribution from mixed Cluster sources or moving source classifications. `Task Request 검토` reaches the whole system queue; no per-Area Request count or new column. |

### Engineering decisions retained from D-59 §4

1. Dashboard owns composition; domain modules own authorization and grouped predicates,
   Analytics Areas owns batch catalog metadata, and Entity Linking owns relation/visibility meaning.
   Public owner seams preserve trustworthy numbers without a second command or permission system.
   FE composition stays in `features/integration`; repair happens through owning source commands.
2. Add authenticated `GET /dashboard/analytics-areas` (implemented by #1078), retaining `/dashboard/summary`
   and its Home contract. An elevated-role entry gate plus independent source gates prevents
   a new report from widening visibility. The exact query/response is in `docs/implementation/api/dashboard.md`.
3. Attribute each object to its own current nullable Area UUID; linked objects never change that
   attribution. Include null and referenced archived classifications and batch-resolve metadata.
   Stable UUID paging prevents same-name/slug reuse from silently merging work. Context totals
   are independent of the selected Area and page length so partial classification stays visible.
4. Survey supplies grouped Survey-level `follow_up_needed` signals with the ADR-0055 classifier
   threshold applied before classification. Count distinct Surveys, never poor responses.
   Even personal-read holders get no personal fields here. This reuses a safe operational signal
   rather than turning Area filters into a response-count or subtraction oracle.
5. Implement exact source-list and strict browser-search support before emitting report links.
   Grouped counts and destination membership reuse the same owner predicates. A number must
   lead to the work it promises, with visible removable filters, rather than an unfiltered board.
6. Consume the canonical expected-follow-up/no-follow-up resolution and source/action identity
   from the separately scheduled ADR-0059 D3 recovery work. Do not fork its lifecycle or wait
   for snooze/history UI. This keeps one repair reflected across operational surfaces.
7. Use bounded grouped queries plus batch metadata, not per-Area/per-record/per-Survey calls.
   Measure around 5k VOCs/5k Tasks before adding an index. A protected Survey reader migration
   is allowed only if necessary, journaled, with narrow grants, fixed search path and PUBLIC
   revoke; no reporting table/cache or Area backfill is justified by this decision.

## Consequences and non-goals

The full product spec is FR-DASH-002 in `docs/design/08-dashboard-system.md`.
Unavailable is absent on the wire and `—` in the UI; authorized empty is zero; zero denominator
has no percentage/status. Hidden linked facts must never become missing-work counts.
Unexpected backing failures fail visibly. Snapshot links recheck live permissions and state.
Current source classification is not a historical snapshot or causal improvement measure.

ADR-0017's flat catalog, UUID identity and archive behavior are unchanged. ADR-0045 inheritance
is an editable default. `linked_task_id` stays a convenience projection; the report handoff
predicate and `execution=none` use active canonical `requested_task` links to Task Request or Task.
The existing summary definition changes only if an implementation chunk deliberately corrects a
shared owner predicate with regression coverage; its wire contract is not replaced by this report.

No Area permission, hierarchy, mandatory classification/link, source mutation on report read,
automatic Task creation, Survey Response→VOC conversion, Task→reporter-status mapping,
per-Area Task Request/Permission Request total, Reporter report, composite priority score,
overlapped-gap sum, independent-population funnel, trend/cohort UI, export or custom chart.
Released-update means at least one existing non-skipped Public Update, not every reporter updated
after release. Extensions needing a new decision are recorded in the post-MVP backlog.

## Implementation issues

Historical planning text (#1071). The chunks below were filed and shipped as #1077 (PRs #1161,
#1162), #1078 (PR #1163) and #1079 (PR #1164). The recovery dependency resolved to #1045
(ADR-0059 D3), which shipped no VOC no-follow-up resolution storage; VOC `tab=high-no-link` keeps
the list predicate the Dashboard recovery queue already uses. #1226 adds
VOC-owned current no-follow-up decision storage and audited `voc.triage`
record/withdraw commands. Its current decision is included in that same owner
predicate for recovery, navigation, coverage and this report; it does not change
report grain or the `no-task` direct-link complement.

Implement in this order; each issue includes affected canonical docs and tests, not a separate copy-only round. When #1071 was written, the report route, query keys and grouped read projections did not exist; they shipped in the PRs above.

### I1 — Give source lists exact Analytics Area and report-gap filters

- **BE + FE; `impl-complex`.** Touch VOC/Finding/Task/Survey read services, owner repositories, routes and public barrels, shared query schemas, clients/hooks, strict browser search schemas, and owning rendered lists. Existing modules: `apps/backend/src/modules/{voc,findings,tasks,surveys,analytics-areas}`; `packages/shared/src/{vocs,findings,tasks,surveys}`; `apps/frontend/src/features/{voc,findings,tasks,surveys}` and their existing route files.
- Dependencies: #1071 accepted owner decisions; implement the accepted ADR-0069 and the canonical contracts from #1071. Canonical expected-follow-up/no-follow-up predicate comes from ADR-0059 D3 close-out work; coordinate that interface before changing `high-no-link`. Existing `/dashboard/summary` behavior changes only where a shared canonical predicate is deliberately corrected with regression coverage.
- Acceptance: real source-route requests as Admin, scoped Developer A, Developer B, and User prove UUID/unset Area filters, same-name Areas in different systems, foreign workspace isolation, and no permission widening; totals agree with paginated membership. Invalid scope combinations do not probe hidden Area/object existence. Existing unfiltered/legacy unset URLs still work.
- Rendered acceptance: filter chips and clearing; selected detail and Back/Forward restore filters; each new gap/status filter survives strict search validation and reaches the typed API. Task in-flight/overdue filters test due yesterday/today/null and Done/Released/Reopened. Finding tests include canonical direct Task and Task Request links and inactive-link complements.
- Audit acceptance: ordinary list/count reads create no domain mutation or new audit event; personal Survey source reads retain their existing personal-read audits. Repair commands remain unchanged and use their current mutation/audit contracts.

### I2 — Compose the safe, bounded Dashboard Area report read model

- **BE + shared; `impl-complex`.** Touch `apps/backend/src/modules/dashboard/{routes,service,repo,index}.ts`, approved grouped readers in the source modules, Analytics Area batch metadata seam, and `packages/shared/src/dashboard.ts`. Survey projection stays Survey-owned; a protected batch-reader migration, if needed, must register in `apps/backend/migrations/meta/_journal.json`.
- Dependencies: I1 predicates; canonical recovery resolution interface from ADR-0059 D3. Do not copy classifiers or add report-specific decisions/assignments.
- Acceptance through the real report route: Admin; Developer with VOC-only, Finding-only, Task-only, and Survey-only scopes; mixed scopes; User; foreign workspace; Survey explicit deny including Admin. Inspect the wire payload for absent groups, truthful zeros, no hidden counts/labels/endpoints, and zero source mutations/report-read audit writes.
- Fixture assertions: Area with only Task/Finding/Survey data appears; all-unclassified works; archived UUID/name and slug reuse remain distinct; source reclassification moves only that source; multiple links count once; all Area pages plus unset reconcile to their own domain totals under identical scopes. Context totals remain independent of Area selection/page length. No ratio is computed from unrelated populations or page lengths.
- Survey acceptance: below-threshold closed outcome, open outcome, no poor answer, qualifying Finding, not_actionable Finding, and current no-follow-up resolution follow ADR-0055. Multiple poor responses in one Survey still yield one Survey signal. Neither Admin nor personal-read grants add raw/per-response fields; direct personal-table reads remain forbidden.
- Performance acceptance: seed about 5k VOCs/5k Tasks with many Areas and links; verify query plans and request/render timings. A fixed set of grouped queries plus batch metadata reads must replace per-Area/per-record/per-Survey service fanout; paginate report rows and bound response size. Measure before adding an index; do not preemptively add a materialized cache.

### I3 — Deliver Coverage's Area tab and prove action continuity

- **FE; `impl-complex`.** Touch `apps/frontend/src/features/integration/routes/CoverageRoute.tsx`, feature-local report table, `apps/frontend/src/routes/_authed/integration/coverage.tsx`, Integration's Coverage entry card, `apps/frontend/src/lib/api/dashboard.ts`, and `apps/frontend/src/lib/copy/coverage.ts`. Reuse PageShell/components; add no global rail or Admin report route.
- Dependencies: I1 and I2. The new tab uses its own typed report query/cache key, including scope/Area/pagination and current session lifecycle; switching to it must not eagerly load every source detail or personal result.
- Rendered acceptance: positive count click opens exactly the scoped predicate, not a generic board; permitted zero/unavailable/zero denominator/loading/error/permission loss remain distinct; null and archived labels; Area containing no VOC; all-unclassified empty explanation; URL restore; keyboard tab/link operation and visible focus; scope switching cannot display stale prior-scope counts.
- End-to-end acceptance: triage an unassigned VOC, add the permitted execution connection, review the linked reporter context, and return/refresh. Verify updated counts using owning command routes and their existing actor/audit contracts; Task release alone does not resolve VOC. Survey no-personal access reaches the source's safe/blocked state, never copied response detail.
- Conductor verification: relevant BE integration modules against a throwaway database; unit/static gate; 1440 desktop visual harness for Coverage and changed Integration entry (existing `apps/frontend/tests/visual/coverage.visual.spec.ts`, `integration-dashboard.visual.spec.ts`). Review loading/denied/empty and a dense populated report. Run the repository gate before delivery; the #1071 documentation worker did not run it or create a PR.
