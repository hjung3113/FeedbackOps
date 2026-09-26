# RESEARCH-5 — Dashboard coverage / unlinked-data 고도화

This item still needs a user decision. It does not need a choice among four equal readings of one undefined line.

`docs/design/13-mvp-roadmap.md` Phase 1 lists "Dashboard coverage / unlinked data 고도화" and does not define it. That string appears nowhere else. `GET /dashboard/summary` already returns coverage percents, a good/warn/bad band, and an unlinked high-severity queue count. Picking an enhancement and designing it from that bullet alone would guess.

Two of the gaps below are not readings of that bullet. The sources already assigned them to MVP, and the summary does not meet them:

- **D is a correctness bug** in shipped behavior. The high-severity unlinked queue and the `high-followup` ratio do not track the follow-up MVP Success Flow step 8 names, and they fail a Slice 7 exit criterion on a slice marked shipped. Fix it whether or not Phase 1 is scoped.
- **B is FOP-DASH-002, MVP / MUST** (`docs/design/02-requirements-matrix.md`). The summary cannot group the metrics by Managed System. Schedule it as MVP debt, not as a Phase 1 option.

**The open choice is A, C, or both.** A has a route contract and a prototype screen. C has only a prototype, and `HANDOFF.md` says persisting the cutoffs is a new contract. Neither is recommended here.

B's breakdown is a table, and it needs a surface. The coverage page in A is the natural one: B's own description is "a table on the coverage surface," so choosing A is what gives B its screen. Home already renders the rolled-up card, so B is not blocked if A is declined — the table can land on Home. Do not invent a second screen for it. D does not depend on A or C. A and C do not depend on each other.

"What already ships" and "What the sources actually say" are underneath so each item can be checked against the code.

## Build regardless

### D. Fix the high-severity unlinked predicate (shipped bug)

**What.** A high or critical VOC counts as followed up when it has a direct follow-up link, or when it is a member of a cluster that has an active follow-up link. Today any active `entity_links` row with the VOC as source or target counts, and a Finding created from the VOC's cluster does not. Two changes, plus copy. They are not one medium blob.

**(a) Direct link-type filter. Lift: small.** On the VOC side, drop `voc ↔ voc` `related_to` from the "has a link" test. Keep `source_type = 'voc'` and `target_type IN ('finding', 'task', 'task_request')`.

This is the only non-follow-up link the predicate can see. `entity_links_tuple_check` (`apps/backend/src/db/schema/core.ts`, the check last replaced in migration `0039`) allows four VOC-side tuples and no others: `voc → voc` `related_to`, `voc → finding` (`created_finding` | `evidence_of`), `voc → task` `evidence_of`, `voc → task_request` `requested_task`. There is no `voc → survey` tuple and no `voc → voc_cluster` tuple. A VOC linked only to a Survey or a cluster **cannot** be stored, so it cannot be "followed up" by today's percent. Cluster membership is a row in `voc_cluster_members` (`apps/backend/src/db/schema/voc-cluster.ts`), not an entity link. The earlier draft of this option had that backwards.

**(b) Cluster-mediated follow-up. Lift: medium. This is the defect that matters.** Creating a Finding from a VOC Cluster writes only a `voc_cluster → finding` link (`apps/backend/src/modules/voc-clusters/conversion.ts`, create path lines 139–155, `created_finding`). The attach path (line 318) writes `voc_cluster → finding` `evidence_of` and is the same shape. No per-member `voc → finding` link is written. A high-severity VOC that follows the MVP first success path therefore never gets a direct link:

```text
3. 유사 VOC를 묶어 VOC Cluster를 만든다.
4. Cluster에서 Finding을 만든다.
5. Finding에서 Task Request를 만든다.
6. Admin 또는 same-scope Developer가 Task Request를 승인해 Backlog Task를 만든다.
```

(`docs/design/13-mvp-roadmap.md` lines 134–137.) That VOC stays in `high-severity-unlinked` and is counted as not followed up in `high-followup`. False positive in the queue, not a false negative. The fix: a VOC that is a member of a cluster with an active `voc_cluster → finding` or `voc_cluster → task_request` link counts as followed up, via `voc_cluster_members` joined to those cluster links. Both cluster tuples are already in `entity_links_tuple_check`.

**One decision, do not invent it in the patch.** `docs/design/08-dashboard-system.md`: "High Severity VOC follow-up is considered present when the VOC has a linked Finding, linked Task Request, linked Task, or an authorized no-follow-up-needed decision." "The VOC has" is ambiguous for a cluster-mediated link. The cluster holds the Finding link; the member VOC does not. Step 8 of the same success flow says the dashboard tracks that follow-up for the High Severity VOC, and steps 3–4 create the Finding on the cluster. Counting the cluster link matches the success path. Requiring a direct `voc → finding` row matches a literal reading of "the VOC has." The predicate change in (b) waits on that call.

**Why this is a bug, not an option.**

- MVP Success Flow step 8, `docs/design/13-mvp-roadmap.md` line 139: "Action Dashboard에서 High Severity VOC의 Finding / Task Request / Task / no-follow-up decision 여부를 추적한다."
- Slice 7 exit text, `docs/implementation/08-mvp-slice-plan.md`: "High Severity VOC eligible for follow-up and currently lacks Finding, Task Request, Task link, or authorized no-follow-up-needed decision." The slice is marked shipped ("Historical exit criteria — not an open queue").
- The query does not implement either sentence. `apps/backend/src/modules/voc/repo-read.ts` lines 120–127: `high-no-link` is severity `high` or `critical` and no active `entity_links` row with the VOC as source or target. `service.ts` lines 176–184 set `high-followup` to `(that high/critical total) − (that unlinked count)`.

**Shared predicate. The list UI moves with the queue.** `buildVocListPredicate` (`repo-read.ts` lines 86–88, 120–127) is the canonical list/count predicate. The comment says navigation counts stay on this path so a badge cannot drift from the VOC list. `no-link` and `high-no-link` are the same branch; only `high-no-link` adds the severity test. The dashboard route is `/vocs?view=inbox&tab=high-no-link` (`packages/shared/src/dashboard.ts`). Inbox renders that tab as "High · no link" and the sibling as "No link". Fixing the predicate changes both tabs. That is the right blast radius: the list the queue opens has to use the same rule. Do not give the dashboard a private predicate and leave the tabs on the old one.

**Copy, in the same fix.** `apps/frontend/src/lib/copy/home.ts`:

- Line 23 detail: "High/Critical severity의 VOC 중 Finding 연결이 없는 항목입니다." Narrower than the query and narrower than the contract. Task Request and Task also count; Finding alone is not the rule.
- Line 23 `primaryAction`: "Link Finding". The card is a review of missing follow-up, not a Finding-only action. The summary's own next action (`service.ts` line 104) is "Review high severity VOCs".
- Line 31: `high-followup` is labeled "High severity VOC follow-up SLA". The metric is a ratio of high/critical VOCs that have follow-up over high/critical VOCs. It has no time component.

**Tests that pin today's `high-no-link` semantics.** Changing the predicate has to update these, and they belong on the owned-files list:

- `apps/backend/src/modules/voc/__tests__/triage-high-tab.integration.test.ts`, `AC-4: preserves high-no-link as high and critical VOCs without active links`. This is the assertion that encodes the bug in (a). It inserts `voc → voc` `related_to` and expects that high VOC to be **absent** from `GET /vocs?view=triage&tab=high-no-link`. It also pins severity: critical and high unlinked VOCs are in, a medium unlinked VOC is out. After the fix, the `related_to` VOC belongs in the tab; a direct `voc → finding` / `voc → task` / `voc → task_request` VOC does not; a member of a cluster with an active cluster follow-up link does not. Keep the severity pin.
- `apps/backend/src/modules/dashboard/__tests__/summary.integration.test.ts` pins the queue route and the numeric contract derived from the same tab: admin `high-severity-unlinked` +5 and `high-followup` 2/7; developer +3 and 1/4. The seed's follow-up links are direct `voc → task` `evidence_of` and `voc → finding` `created_finding` (the seed comment: "Two high VOCs have a backing link"). Those tuples stay "followed up" under both (a) and (b), and the seed creates no cluster, so the current deltas survive. The suite does not cover `related_to` and does not cover cluster membership. A green run of those deltas is not evidence the bug is fixed. Add both cases.
- `apps/backend/src/modules/voc/__tests__/list-vocs.integration.test.ts`, `AC14: tab=no-link returns full set in Slice 3`, shares the branch but only asserts that an unlinked VOC is present. It does not pin which link types exclude a row. Re-read it when `no-link` changes; it is not the pin AC-4 is.

**Do not fold these into D's estimate.** Named in the same design lists, and not a tweak of this predicate:

- Authorized no-follow-up-needed. Described in `08-dashboard-system.md` and `docs/design/10-cross-system-workflows.md`. No `no_follow_up` / `mark_no_follow_up` symbol exists under `apps/backend/src`.
- "VOC Cluster marked needs_synthesis without Finding" (Slice 7 list and `08-dashboard-system.md`). No `needs_synthesis` symbol exists under the repo's TypeScript or SQL.
- "Task without Evidence" (`08-dashboard-system.md` action list). Not counted. Possible later as another `entity_links` predicate, but it is a new queue id, not part of fixing high-severity.
- `milestone-outcome`. Allowed by `packages/shared/src/dashboard.ts` and shown in prototype data. `service.ts` lines 174–175 omit it: "milestone-outcome has no MVP Milestone table or backing filter." `08-dashboard-system.md` also says milestone-to-outcome gap detection "is a future cross-system workflow, not an MVP action queue." `10-cross-system-workflows.md` WF-X-004 is "Future workflow, not MVP core."
- **"Survey Finding without Task"** (`08-dashboard-system.md` action list, with the items above). Not implemented as a queue. The only survey queue the summary pushes is `bad-outcome-no-followup`. The tuples that would back it already exist: `survey_response → finding` (`generated_finding` | `evidence_of`).
- **"Task Request pending approval"** (same action list, and the Slice 7 list). Not a queue and not a route. `service.ts` lines 120–121 add `countPendingTaskRequests` into `kpis.pending_request` only, mixed with permission requests. `finding → task_request` `requested_task` already exists; this item is the pending request, not a missing link.

Those two queues fit a literal reading of "unlinked data 고도화" better than editable cutoffs do. They are still separate queue work. They are not part of the D predicate fix, and they are not the A vs C choice.

The current predicate also has no policy input. `08-dashboard-system.md` says missing-link queues show only records where a link is expected, and lists workspace policy, Managed System policy, and a severity rule as sources of that expectation. "High Severity VOC **eligible** for follow-up" implies an eligibility input the query does not read. That is a further reading of the same section. It is not required to stop the false positive in (b), and it is not chosen here.

### B. Break the existing totals out per Managed System (Analytics Area only as a nested count)

**What.** Keep the same five coverage ratios and the same queue counts, but return them as one row per Managed System inside the caller's scope, instead of one rolled-up number. Analytics Area rows only where VOCs in that system have an area, nested under the system. Admin `managed_system_id=all` becomes that table, not a new admin product.

**Why it is MVP debt, not a Phase 1 reading.** The summary can filter to one system or fold every visible system into a single percent. It cannot show the breakdown the dashboard contract marks MUST.

- `docs/design/08-dashboard-system.md` FR-DASH-002 (Priority MUST): "VOC, Finding, Task, and Survey metrics can be grouped by Managed System. Analytics Area breakdowns appear only when Analytics Area data exists and are nested under or filtered by Managed System."
- Same doc, MVP metric scope: "Managed System breakdowns" and "Analytics Area breakdowns only when data exists."
- `docs/design/02-requirements-matrix.md` line 44: FOP-DASH-002, phase MVP, "Show Managed System And Analytics Area Breakdowns". The matrix's MVP column is MUST for this row. Not LATER.
- `apps/backend/src/modules/dashboard/repo.ts` `countAnalyticsAreaVocCoverage` (lines 155–160) is `count(*) FILTER (WHERE analytics_area_id IS NOT NULL)` over non-archived VOCs. That is an assignment rate, not a per-area count. Prototype label in `docs/design-prototype/data.js` matches the rate ("VOC with Analytics Area set"); home copy says "Analytics area coverage."
- `managed_system_id=all` is already the actor's scope union (workspace-wide only for Admin). See `docs/implementation/api/dashboard.md`. There is no per-system payload.

**Lift: medium to large.** The `GROUP BY` is the small part. The cost is the omission rule, applied per Managed System and per metric. Each count already goes through a different capability, and a grouped row has to do that per system:

- Finding metrics: `actorFindingReadScope` with `requireElevatedRole: true` (`service.ts` line 79).
- Task metrics: `finding.manage` (`service.ts` line 80).
- Survey metrics: data-derived survey read scope, with the admin special case at `service.ts` lines 86–93 (an Admin can see an empty outcome queue even when no survey contributes a Managed System id).
- VOC metrics: `voc.read`.

`docs/implementation/api/dashboard.md`: a permitted empty result is present with zero; an omitted key means the actor cannot receive that projection, not that the count is zero. A system the actor can see for VOCs but not for Findings must omit the finding key for that row. Emitting `0` there leaks a zero where the key should be absent. That rule, not the `GROUP BY`, is why this is medium-to-large. Response shape or a sibling read (the current `coverage[]` items have no system id) and a table on the coverage surface — Home if A is declined, the coverage page if A is chosen. Not a new chart.

**Leave out of this option.** "Archived Analytics Areas remain visible in historical metrics" (FR-DASH-002). Nothing stores historical metric snapshots, so that sentence is a different, larger piece of work. Also leave out Phase 1's separate bullet "Analytics Area별 리포트" — that is a report, not a breakdown of these ratios.

## Open choice: A or C (or both)

### A. Build the Coverage page and one-hop links off the numbers that already exist

**What.** A `/integration/coverage` screen that renders the current summary (coverage rows + missing-link queue counts), and makes each row open the filtered list that already exists. Home's "View coverage" would point there instead of entity links.

**Why it is a real gap.** The route is in the route contract. The prototype screen exists. The production route does not, and the home coverage bars are not links.

- `docs/frontend/routes-and-layout.md` lists `/integration/coverage?managedSystem=:managedSystemId|all`.
- `apps/frontend/src/features/integration/AGENTS.md`: "`/integration/evidence` and `/integration/coverage` are planned, not yet built."
- `docs/design-prototype/DESIGN-MAP.md` marks `integration-coverage` as `contract-only`: "No route file; not in `NAV_TREE`."
- `apps/frontend/src/features/home/HomeScreen.tsx` sets `HOME_COVERAGE_HREF = '/integration/links'`. `CoveragePanel` draws percent bars and does not attach a route to a coverage id.
- `docs/design/08-dashboard-system.md`: "Chart clicks should navigate to the relevant filtered queue, list, or detail context." The same paragraph forbids "multi-level analytical drilldown" and "chart-to-chart linked brushing."

**Lift: small to medium.** Small if the page only recomposes `GET /dashboard/summary` and links the rows whose route is already a filtered list (`high-no-link`, unassigned VOC, `/tasks?view=board`, `/surveys`, permission requests). Medium where the existing route is not a filtered one-hop, or no list filter exists:

- `actionable-finding-no-execution` already routes to an **unfiltered** `/findings` (`packages/shared/src/dashboard.ts` line 5). That queue is not in the small bucket. One-hop for it is a new filter on the findings list.
- `voc-task` needs a "no `voc → task` link" filter. The inbox `no-link` tab is the wrong predicate: it is "no active entity link of any registered tuple," which is the bug in D, not "no task link."
- `analytics-area` (assignment rate), `released-update`, and `finding-execution` have no list filter today.

Those need a new query on an existing list, not a new metric. The `high-no-link` hop is only as correct as D's predicate, because the queue and the tab share it.

**Not this option.** A chart library, a second coverage calculation, or click-through into raw rows inside the chart.

### C. Let the workspace set the good/warn cutoffs for the metrics that already exist

**What.** Replace the hardcoded band with workspace-saved cutoffs for the coverage ids the summary already emits. Default stays whatever is chosen at design time. No new ratio.

**Why it is a real gap, and why it is only a prototype gap.** The server band is fixed. The prototype has an edit modal and says the API for it does not exist. The dashboard design doc never mentions editable thresholds.

- `apps/backend/src/modules/dashboard/service.ts` lines 51–53: `value >= 75 ? 'good' : value >= 40 ? 'warn' : 'bad'`.
- `docs/design-prototype/screen-coverage.jsx` line 116: modal default `{ good: 65, warn: 45 }`. The screen's "New policy" button and the callout that thresholds live in workspace settings are prototype copy.
- `docs/design-prototype/HANDOFF.md`: "Coverage thresholds persist to `window.COVERAGE_THRESHOLDS` (in-memory). No coverage-threshold endpoint exists in the catalog — `api/core.md` settings has no such field, so wiring one would be a new contract, not a wiring task."
- Workspace settings today are `permission_self_approval` and `survey_anonymity_threshold` only (`docs/implementation/api/core.md`).

**Lift: small to medium.** One settings field (or one pair per coverage id), audit on change, admin control, and `coverageStatus` reads the saved cutoffs. The color is already rendered by `HomeScreen`.

**Not this option.** The prototype's "New policy" action. `docs/design/08-dashboard-system.md` lists "custom calculated metrics" under out-of-MVP metric scope. Also not this option: the two unimplemented action-list queues named under D ("Survey Finding without Task", "Task Request pending approval"). Those are closer to "unlinked data" than a cutoff editor is.

## Side-by-side

| | A. Coverage page + one-hop links | B. Per-system breakdown | C. Editable cutoffs | D. Fix the unlinked rule |
| --- | --- | --- | --- | --- |
| Status | Open choice | MVP gap. FOP-DASH-002 MUST. Build regardless | Open choice | Shipped bug. Build regardless |
| User-visible change | A coverage screen; bars and queues open an existing list | One row per Managed System instead of one percent | Same percents; good/warn/bad moves when an admin changes the cutoff | Same card. Cluster-path VOCs leave the unlinked queue. A VOC↔VOC `related_to` link no longer counts as follow-up |
| New API | No, unless a coverage id needs a list filter | Yes: grouped payload or a second read | Yes: workspace setting. HANDOFF already says this is a new contract | No new route. Predicate change on the shared VOC list predicate |
| New UI | `/integration/coverage` and home href | A table, not a chart. On A's page if A is chosen; on Home if A is declined | Threshold edit. Prototype modal is the layout source | Copy fix: "Finding 연결이 없는", "Link Finding", and the "SLA" label |
| Backend math | None | `GROUP BY`, plus the existing omission rule per system per metric | Read cutoffs instead of 75/40 | (a) drop `related_to`, small. (b) cluster-member join, medium, after the "VOC has a linked Finding" decision |
| Lift | Small, or medium once unfiltered `/findings` and the wrong `no-link` tab are counted | Medium to large | Small to medium | Small for the link-type filter. Medium for cluster-mediated follow-up. Not one medium estimate |
| Conflicts with a written exclusion | No, if drill-down stays one hop | Do not pull in historical archived-area metrics or "Analytics Area별 리포트" | Do not add custom metrics ("New policy") | Do not pretend no-follow-up or `needs_synthesis` can be filtered until those records exist. Survey-Finding-without-Task and Task-Request-pending are separate queues |

## What already ships

Source: `apps/backend/src/modules/dashboard/service.ts` `getSummary` (lines 65–187), `repo.ts`, `packages/shared/src/dashboard.ts`, `docs/implementation/api/dashboard.md`, `apps/backend/src/modules/dashboard/routes.ts`.

`GET /dashboard/summary?managed_system_id=<uuid|all>` is a live read. The handler sets `cache-control: private, no-cache` and calls `getSummary` in the request (`routes.ts` lines 28–32). There is no metric cache and no `computed_at` on `dashboardSummarySchema`. `docs/design/08-dashboard-system.md` and `docs/implementation/03-api-contracts.md` require `computed_at` only "when values can be stale" / "when values may be stale." This response is not stale relative to the database at request time. There is also no recovery-item id, snooze, or three-month history on this payload. Queues are counts plus one `next_action` route.

Permission: a key is omitted when the backing read is denied or scope-required. A permitted empty result is present with zero (`docs/implementation/api/dashboard.md`). Absence is not a zero.

`percent` is `0` when `total` is `0`, otherwise `Math.round((value / total) * 100)` (`service.ts` lines 47–48). Status is the 75/40 band above. `kpis.coverage_percent` is only the `voc-task` percent (`service.ts` line 170), not an average of the coverage rows. The prototype coverage screen averages every policy (`screen-coverage.jsx`).

Coverage rows the service actually pushes:

| id | value / total | When it is absent |
| --- | --- | --- |
| `finding-execution` | Active findings with `linked_task_id` or an active `finding → task_request` `requested_task` link, over active findings in scope (`repo.ts` 36–48) | No finding-read scope in the selected system, **or** the actor fails `requireElevatedRole: true` (`service.ts` line 79). A plain `user` role never sees this row, whatever its scope |
| `released-update` | Released tasks that have an active `voc → task` `evidence_of` link to a non-archived VOC and at least one non-skipped `voc_public_updates` row, over released tasks that have such a VOC link (`repo.ts` 96–141). Matches `docs/implementation/api/dashboard.md` | No task scope (`finding.manage`) |
| `voc-task` | Non-archived VOCs with any active `voc → task` link (`relation_type` not filtered), over non-archived VOCs (`repo.ts` 163–169) | No `voc.read` in the selected scope |
| `analytics-area` | Non-archived VOCs with `analytics_area_id` set, over non-archived VOCs (`repo.ts` 155–160) | Same as `voc-task` |
| `high-followup` | High+critical inbox VOCs minus the `high-no-link` count, over high+critical (`service.ts` 176–184). The subtracted count is "no active entity link in either direction," which is the bug in D | Voc counts denied |
| `milestone-outcome` | Enum value only. Not computed | Always, until a Milestone table exists |

Action queues the service pushes, each a count plus a route:

| id | severity | count is | route |
| --- | --- | --- | --- |
| `unassigned-voc` | urgent | inbox tab `unassigned` (no owner user and no owner team) | `/vocs?view=inbox&tab=unassigned` |
| `high-severity-unlinked` | urgent | inbox tab `high-no-link` (definition in D) | `/vocs?view=inbox&tab=high-no-link` |
| `actionable-finding-no-execution` | warn | active findings with no `linked_task_id` and no `requested_task` link (`repo.ts` 24–33) | `/findings` (unfiltered) |
| `released-task-unresolved-voc` | warn | released tasks with an active `evidence_of` VOC whose reporter-facing status is not `resolved` or `closed` (`repo.ts` 61–88) | `/tasks?view=board` |
| `bad-outcome-no-followup` | urgent | `survey.count_negative_outcome_without_followup` (`repo.ts` 144–152) | `/surveys` |
| `permission-requests-pending` | info | active permission requests; also added into `kpis.pending_request` with pending task requests | `/admin/permissions/requests` |

Not pushed as queues, though `08-dashboard-system.md` lists them with the action queues: "Survey Finding without Task" (no count, no route) and "Task Request pending approval" (count exists only inside `kpis.pending_request`, no queue id, no route).

KPIs besides `coverage_percent`: `open_voc` (inbox count), `active_finding`, `tasks_in_flight` (`todo` / `doing` / `review`), `pending_request`. Not shipped from the system-dashboard lists in `08-dashboard-system.md`: overdue, blocked, milestone progress, survey response rate, new-VOC count, per-area VOC or Task counts.

`docs/design/08-dashboard-system.md` also says Home, Dashboard, and Integration are separate surfaces. The route contract has no `/dashboard`. These numbers are what Home renders.

## What the sources actually say about "enhancement"

The only Phase 1 sentence (`docs/design/13-mvp-roadmap.md`):

```text
## Phase 1

- VOC Cluster Candidate 자동 생성
- 권한 요청 고도화
- Notification Rule
- Outcome Survey workflow
- Dashboard coverage / unlinked data 고도화
- Analytics Area별 리포트
```

The roadmap header says this file "only groups release scope. It is not an execution queue and it does not record what is already built." MVP, above that list, already includes "Action Dashboard 기본형", and the feature matrix already includes "Coverage 지표: SHOULD", "Managed System 현황: MUST", "Analytics Area별 현황: SHOULD when Analytics Area data exists", and "policy-driven follow-up gap 조회: MUST". So the Phase 1 bullet sits on top of coverage the same document already assigned to MVP, without saying which part is the enhancement.

The same file's MVP Success Flow step 8 is not a Phase 1 reading. It is an MVP obligation the summary misses. See D.

```text
8. Action Dashboard에서 High Severity VOC의 Finding / Task Request / Task / no-follow-up decision 여부를 추적한다.
```

Searched `docs/design/08-dashboard-system.md`, `13-mvp-roadmap.md`, `02-requirements-matrix.md`, `10-cross-system-workflows.md`, `docs/implementation/08-mvp-slice-plan.md`, and `docs/implementation/api/dashboard.md` for a definition of this 고도화. No trend-over-time, no configurable-threshold requirement, no admin-only rollup, and no "drill from the card" sentence beyond the general chart-click rule quoted under option A.

Closest written obligations that the summary does not meet:

```text
- queue counts
- total vs linked coverage
- Managed System breakdowns
- Analytics Area breakdowns only when data exists
- overdue, blocked, and simple progress counts
```

(`08-dashboard-system.md`, MVP metric scope. Queue counts and several total-vs-linked ratios are implemented. The breakdown lines are B, and they are FOP-DASH-002 MUST, not a Phase 1 option. The progress line is not coverage or unlinked-data.)

```text
- Dashboard displays counts for total objects and linked objects.
- Coverage is clearly labeled as partial integration coverage.
```

(FR-DASH-003, Priority SHOULD. Counts are implemented. The partial-integration label is an integration-feature rule in `apps/frontend/src/features/integration/AGENTS.md`; Home's panel title is "Coverage signals".)

```text
- High Severity VOC eligible for follow-up and currently unlinked
```

(`08-dashboard-system.md` and `10-cross-system-workflows.md` WF-X-005. The queue exists. The predicate does not match the follow-up rule two paragraphs later in `08`, and it does not match Success Flow step 8. The mismatch is D: `related_to` counts as follow-up, and a cluster-mediated Finding does not. "Eligible" also implies a policy input the predicate does not read. That input is noted under D and is not decided.)

Out of scope in the same dashboard doc, so not a reading of this Phase 1 line: drag-and-drop chart builder, arbitrary pivoting, custom calculated metrics, saved personal layouts, cohort/funnel/retention, export-heavy reporting, executive report generator, advanced BI, complex chart drilldown, custom dashboard builder. Phase 2 separately lists "Executive Report". `docs/design/02-requirements-matrix.md` defines LATER as "Phase 1 or Phase 2" and does not put any dashboard requirement in LATER. FOP-DASH-001 and FOP-DASH-002 are MVP; FOP-DASH-003 is SHOULD. FOP-DASH-002 is B.

Prototype `screen-coverage.jsx` is explicit that it invented structure the spec left open: "The spec is intentionally vague about which links MUST exist; this screen surfaces the policy-defined coverage targets (CoverageMetrics) plus the missing-link queries from FR-LINK-003." Its extra queries — VOC missing an executing Task as its own queue, standalone Task with no source, released milestone without an outcome survey, stale links untouched for 90 days — are mock rows in that file (`MISSING_LINK_QUERIES`). They are not in `08-dashboard-system.md`'s queue list, except released-task-unresolved-VOC, which the summary already counts. Prototype default thresholds (65/45) also disagree with the server (75/40), and the hand-authored `CoverageMetrics` statuses disagree with both (for example `voc-task` at 18% is stored as `warn`).

## Not offered as an option

- **Trend over time.** Not named in Phase 1 or Phase 2. The dashboard doc says metrics are "supporting signals for action queues, not a free-form BI analysis surface," and lists cohort/funnel/retention and advanced BI as out of MVP. A time series would be a new store, not a use of the live counts.
- **`computed_at` or a metric cache by itself.** The contract asks for `computed_at` when values may be stale. This endpoint is computed in the request and sent `no-cache`. A timestamp on a live read does not change coverage or unlinked data.
- **Recovery items, snooze, mute, and three-month history.** Specified in `08-dashboard-system.md` and `03-api-contracts.md`. They are a queue model (item id, resolution, history), not a coverage-percent enhancement, and nothing in `apps/backend/src/modules/dashboard/` implements them.
- **Overdue, blocked, and milestone progress.** Named in the system-dashboard and MVP-metric lists. They are not coverage or unlinked-data, and milestone-outcome is explicitly future.

<!-- RESEARCH-5-DONE -->

## Revision (opus review addressed)

**Reclassification.** D is a correctness bug in shipped behavior, not a Phase 1 option: MVP Success Flow step 8, and a Slice 7 exit criterion on a slice marked shipped. B is an MVP gap, FOP-DASH-002 MUST, not a Phase 1 reading. The real open choice for the user is A vs C, or both. D and B are things to build regardless of that choice.

Independent review: `.review/RESEARCH-5-dashboard-coverage-OPUS-REVIEW.md`. What changed from the first draft:

- Option D no longer says a VOC linked only to a Survey or a cluster counts as followed up. That tuple cannot be stored. The real defect is the opposite: cluster → Finding writes `voc_cluster → finding` only, so a high-severity VOC on the MVP success path (steps 3–4, then Task Request, then Task) stays permanently unlinked. (a) is a small `related_to` exclusion. (b) is the medium cluster-member join, and it needs a decision on whether a cluster-mediated link satisfies "the VOC has a linked Finding."
- B's lift is medium-to-large. Every grouped row has to apply the per-capability omission rule (finding = elevated, task = `finding.manage`, survey = data-derived plus the admin special case, VOC = `voc.read`) per Managed System. A zero where the key should be absent breaks the contract.
- "Survey Finding without Task" and "Task Request pending approval" are recorded under D's exclusions. They are closer to "unlinked data" than C is. They are not a fifth reading of the Phase 1 line and not part of the A/C choice.
- `finding-execution` absence includes `requireElevatedRole: true`. Home copy to fix with D now includes the "SLA" label and the "Link Finding" primary action, not only "Finding 연결이 없는".
- D names the shared predicate: `buildVocListPredicate` backs the dashboard queue and the inbox `high-no-link` / `no-link` tabs, so the list UI moves with the fix.
- D names the tests that pin today's semantics. AC-4 in `triage-high-tab.integration.test.ts` is the one that treats `related_to` as follow-up. The dashboard summary deltas survive but do not cover the bug.

Claims the review checked and this revision left in place: the 75/40 band, `kpis.coverage_percent` as the `voc-task` percent, the `milestone-outcome` omission, the `high-followup` subtraction, `cache-control: private, no-cache` with no `computed_at`, the coverage and queue predicate tables, Home's coverage href, the missing `/integration/coverage` route, the prototype threshold modal and `MISSING_LINK_QUERIES`, the two workspace settings, and the absence of `no_follow_up` / `needs_synthesis`. A's one correction inside that set: unfiltered `/findings` is medium, not an already-filtered hop, and `voc-task` cannot reuse the `no-link` tab.

<!-- RESEARCH-5-REVISED-DONE -->
