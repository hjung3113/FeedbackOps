# Dashboard System

## Purpose

Dashboard is an operational queue and coverage surface, not a passive status board.

It shows local system queues, optional integration coverage, and configured follow-up gaps. A missing link is actionable only when a workspace policy, Managed System rule, severity rule, or user-created workflow expects that link.

Home, Dashboard, and Integration are separate action queue-first surfaces:

```text
- Home answers: What can I personally act on now?
- Dashboard answers: Where is this Managed System or workspace operationally stuck?
- Integration answers: Where is source evidence, synthesis, execution, or validation disconnected?
```

The recovery-item model is accepted for close-out by ADR-0067, superseding ADR-0059 D3; 56-G implements summary freshness and live recovery list/detail. 56-H adds backend presentation/history/occurrence tracking; 56-I implements Integration-owned shared frontend navigation, personal presentation/history and independent freshness on Home, Integration and Coverage. Desktop-1440 visual baselines and the ~5k scale measurement (`recovery-scale.integration.test.ts`, opt-in `RECOVERY_SCALE=1`) were verified at delivery; every warm summary/list/detail/history p95 stayed within §4's 500 ms budget. All six D3 capabilities are required within the bounded contract below, preserving ADR-0055.

Home, Dashboard, and Integration may present the same underlying recovery item,
but they must not create separate lifecycle state for it.

On Home, only queues with positive counts appear in the main grid; zero-count queues share a
compact strip of links. Omit the recovery queue section or Coverage section when its API array is
empty, and show one Managed System scope explanation when both arrays are empty.

```text
- Home presents only recovery items the current actor can personally act on now.
- Dashboard presents aggregate operational context and representative queues.
- Integration presents detailed evidence/link/workflow recovery queues.
- Shared recovery items use the same recovery_item_id or the same source/action identity.
- Resolving a shared item from any surface removes or updates it everywhere.
- Presentation may differ by surface, but resolution state must not fork.
- User-level snooze or mute is allowed only as presentation state. It must not
  resolve, dismiss, or fork the underlying recovery item.
- Any actor who can see a recovery item may snooze or mute it for their own
  presentation state only. Workspace-wide or Managed-System-wide snooze is out
  of MVP because it changes operational policy rather than personal display.
- Resolved recovery items leave active queues, but open detail panels show a
  resolved state instead of disappearing. Dashboard activity/history preserves
  recently resolved recovery items for three months.
- Dashboard history shows only safe summaries and resolution metadata for
  resolved recovery items. Opening the source object from history re-checks
  current permissions and may hide the source jump or show request-access.
```

## Boundary

Owns:

```text
- System dashboards
- Action queues
- Coverage metrics
- Missing-link visibility
```

Does not own:

```text
- Source object lifecycle
- Entity Link relation registry
- Permission policy
- Workflow state transitions
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
```

## Dashboard Types

```text
- System Dashboard
- Action Dashboard
- Integrated Coverage Dashboard
```

## System Dashboard

VOC Dashboard:

```text
- 신규 VOC
- 미분류 VOC
- High Severity VOC
- VOC Cluster
- Analytics Area별 VOC
```

Task Dashboard:

```text
- Managed System별 Task
- Milestone 진행률
- 지연 Task
- In-flight Task (Todo/Doing/Review); Task has no Blocked status (ADR-0003, amended by ADR-0027)
- Analytics Area별 Task
```

Survey Dashboard:

```text
- Active Survey
- 응답률
- Low Score Response
- Finding 후보
- Outcome Survey 결과
```

## Action Dashboard

Core queues are policy-driven. The dashboard must distinguish independent-system queues from optional integration recovery queues.

Missing-link queues show only records where a link or follow-up is expected.
Expected links come from:

```text
- workspace policy
- Managed System policy
- severity rule
- VOC Cluster state such as needs_synthesis
- explicit workflow configuration
- Released Task with unresolved Reporter-facing VOC Status
- poor Outcome Survey with configured follow-up
```

The dashboard must not show every unlinked object as a problem. A VOC without
Finding or Task is not a gap unless one of the expected-link conditions applies.

```text
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently unlinked
- VOC Cluster marked "needs synthesis" without Finding
- Finding marked actionable without Task Request or linked Task
- Task Request pending approval
- Survey Finding without Task
- Task without Evidence
- 완료됐지만 고객 상태가 갱신되지 않은 VOC
- Outcome Survey 결과가 나쁜데 configured follow-up이 없는 항목 (ADR-0055: closed 상태의 outcome Survey에서 응답 수가 anonymity threshold 이상이고, rating 답변이 low band에 하나 이상 있으며, 활성 generated_finding 링크의 Finding 현재 상태가 draft/active/converted도 아니고 현재 no_follow_up 결정도 없는 응답)
```

Attaching Survey evidence to an existing VOC is context enrichment, not follow-up
completion. ADR-0055 clears a poor Outcome Survey response gap only through a qualifying current
`generated_finding` link or a current `no_follow_up` decision. Task Request/execution
links and evidence attachment alone do not clear it.

No-follow-up-needed is an operational decision, not a passive absence of work.
It requires an authorized Admin or same Managed System Developer with the
relevant workflow capability, a required reason, and audit metadata. Reversing
the decision uses a separate reopen-follow-up action and re-evaluates recovery
items; the original decision history is not deleted.

Active Dashboard queues hide recovery items resolved by no-follow-up-needed.
Dashboard history and source object detail show that the gap was resolved by a
no-follow-up decision.

VOC #1226 implements this with `voc.triage` (deny-first on the VOC's Managed
System), required reason and audited POST/DELETE `/vocs/:id/no-follow-up`.
Only high/critical VOCs without direct or Cluster-origin follow-up may record a
current decision. That decision clears the canonical `no-link`/`high-no-link`
predicate, navigation counts, high-follow-up coverage and Area report counts.
Withdrawal re-evaluates current truth; it creates a new visible recovery
occurrence only while severity, archival and links still leave an active gap.
Reporter-facing status and direct Task-link coverage remain separate.


Milestone progress is a Task Dashboard grouping in MVP. Milestone-to-Outcome-Survey gap detection is a future cross-system workflow, not an MVP action queue.

Finding is optional in MVP. High Severity VOC follow-up is considered present
when the VOC has a linked Finding, linked Task Request, linked Task, or an
authorized no-follow-up-needed decision. Missing Finding alone is not a gap
unless workspace policy explicitly requires Finding synthesis for that case.

## Coverage Metrics

Integrated Dashboard must show coverage so users do not mistake partial integration for total system truth.

Example:

```text
전체 VOC: 1,000
Task와 연결된 VOC: 180
Coverage: 18%
```

Dashboard metrics are supporting signals for action queues, not a free-form BI
analysis surface.

MVP metric scope:

```text
- queue counts
- total vs linked coverage
- Managed System breakdowns
- Analytics Area breakdowns only when data exists
- overdue and simple Task progress counts; blocked is a Milestone status, not a Task metric
```

Out of MVP metric scope:

```text
- drag-and-drop chart builder
- arbitrary dimension/measure pivoting
- custom calculated metrics
- arbitrary SQL or advanced filter builder
- multi-dataset joins for exploration
- saved personal dashboard layouts
- cohort, funnel, retention, or broad product analytics
- export-heavy reporting workflow
```

Chart clicks should navigate to the relevant filtered queue, list, or detail
context. A chart segment may open the corresponding recovery queue and restore a
selected recovery detail panel when the segment maps to a specific recovery
item. MVP charts must not support multi-level analytical drilldown,
chart-to-chart linked brushing, dynamic raw-data exploration, or
permission-sensitive raw data preview inside the chart.

Recovery item clicks open a Dashboard-scoped detail panel first. The panel shows
the recovery reason, safe affected-object summaries, backend-provided next
actions, snooze or mute presentation controls when allowed, and jump actions to
the source object's owning route. It must not inline full VOC, Finding, Task, or
Survey detail that belongs to the source route.

Dashboard may show a summary-safe recovery item even when the actor cannot see
the full source object, as long as the actor has Managed System scope and gap
visibility for that recovery category. In that case source-object summaries,
jump actions, and next actions must each follow backend-provided visibility
states. Hidden source data must not leak through titles, descriptions, reporter
identity, Survey response text, or chart previews.

Dashboard recovery priority, severity, and reason codes are backend-provided.
Frontend clients may group, sort, and visually emphasize provided values, but
must not independently compute operational priority from linked-object counts,
status badges, or chart values.

Dashboard metrics may be cached separately from action queues. Metric responses
must include `computed_at` when values can be stale. Action queues prioritize
current workflow state over metric-cache freshness.

Recovery items do not own separate assignment. Responsibility is derived from
the source object's owner, reviewer, assignee, permission reviewer, or workflow
policy. The backend may return `responsible_actor_hint` for display and
filtering, but the recovery item must not become a second ownership system.

## Functional Requirements

### FR-DASH-001: Show Action Queues

Priority: MUST

Acceptance Criteria:

```text
- Dashboard shows missing-link queues.
- Dashboard shows local ownership queues such as Unassigned VOC when configured.
- Each queue item has a next action.
- User can navigate to the relevant source object.
- Dashboard must not treat every unlinked record as incomplete.
```

### FR-DASH-002: Show Managed System And Analytics Area Breakdowns

Priority: MUST

Acceptance Criteria:

```text
- VOC, Finding, Task, and Survey metrics can be grouped by Managed System.
- Analytics Area breakdowns appear only when Analytics Area data exists and are nested under or filtered by Managed System.
- Referenced archived Analytics Areas remain visible with archive labels in the current snapshot; this report does not reconstruct historical classifications (ADR-0069).
```

### Analytics Area operational report — FR-DASH-002 (MUST)

Status: Accepted 2026-10-13 by the owner (MVP close-out decisions).
Implemented in Slice 59 (#1077, #1078, #1079); ADR-0069 records the attribution, audience and safe metric-grain decision.
Endpoint authority: `docs/implementation/api/dashboard.md`; source list filters are in the owning API contracts.

Purpose: an Admin or same-scope Developer can identify the Analytics Area needing attention and open the exact work that explains each number. It is a current operational snapshot, with supporting partial-integration ratios, not a funnel or an improvement-success score.

#### Navigation and presentation

1. `/integration/coverage` uses its existing PageShell and gains two URL-backed tabs: default overview (omit `view`) and `view=areas`, labeled `Analytics Area별 현황`. The Area tab supports `managedSystem=<uuid|all>` and optional `filter.analytics_area=<uuid|unset>`. Scope changes clear an incompatible Area filter and pagination. Back/Forward/refresh restore tab and filters.
2. Show a compact table grouped under Managed System. Rows come from the union of readable VOC/Finding/Task/Survey classifications, including Areas with no VOCs. Areas with no readable data are not fabricated as zero rows. Keep a `미지정` row per Managed System when readable objects have a null Area. If all records are unclassified, explain that Area selection is optional and still show that row.
3. Retain referenced archived Areas/Managed Systems with `보관됨` labels and UUID identity. Current classification is used; reclassification moves the record at the next refresh. This is not a historical time-series snapshot. Source records follow their owning archived/status exclusions.
4. Put operational counts/links first; put supporting ratios on a secondary line in the matching domain cell. Reuse shipped Coverage components and Korean chrome. The explanatory copy is: `현재 조회 범위의 현황입니다. 연결이 없어도 후속 조치가 필요한 항목은 아닐 수 있습니다.` Show `computed_at` as `기준 시각`.
5. An unavailable metric is `—` with a scope explanation and no action; an authorized empty count is `0`. A ratio with total zero is `해당 없음`, with no percentage, status color, or repair action. Loading/error/permission loss never appear as zero. Unexpected backing-read errors fail visibly and offer retry.
6. Every nonzero action count is a keyboard-accessible internal link preserving Managed System, Area, and the metric's exact source filter. Show the active filters on the destination with an explicit clear action. A zero work count has no repair CTA. Counts can change between snapshot and arrival; re-evaluate live permissions and state there.

#### Metric definitions

All counts are distinct source objects within their own authorized scope. The destination filters below are implemented (#1077); their wire contracts are the ADR-0069 sections of `docs/implementation/api/{voc,findings,tasks,surveys}.md`.

| Signal / decision supported | Definition per Area | Next action / destination contract |
| --- | --- | --- |
| VOC context: which Area needs triage staffing? | Non-archived VOC total, explicitly including resolved/closed VOCs; separate unassigned count means both user/team owner are null. Do not label the total “open VOC.” | Total → `/vocs?view=inbox`; unassigned → same route with `tab=unassigned`, scoped to this Area. Open VOC detail to assign/triage through VOC commands. |
| High Severity follow-up: what needs a decision? | High/critical VOCs missing the canonical expected follow-up: direct or qualifying cluster-origin Finding/Task Request/Task link, or an authorized no-follow-up resolution. A missing Finding alone is not a gap. | Exact `high-no-link` recovery/list predicate → Area-filtered VOC Inbox; choose Request Task, Finding when synthesis is needed, or the authorized resolution flow. |
| VOC→Task context: how much evidence is linked? | Value = non-archived VOCs with a direct active VOC→Task link; total = non-archived VOCs. No ratio of independent VOC/Finding/Task population sizes. | Supporting ratio opens its **unlinked complement**, `tab=no-task`, with the same Area. Label as connection inspection, not a requirement to create work. |
| Finding handoff: what needs execution planning? | Active Finding total; value = active Findings with a canonical active `requested_task` link to Task Request or Task; gap = active Findings without it. Draft/not_actionable Findings are not execution gaps. | Active list or exact `execution=none` list → `/findings`, scoped to Area. Selected Finding owns Request Task/Link Existing Task. A Request connection is not approval, conversion, or work completion. |
| Task execution: what needs planning or rescheduling? | Counts by the seven actual Task statuses; foreground in-flight = Todo/Doing/Review, plus a separate overdue count for Backlog/Todo/Doing/Review/Reopened with non-null `due_date < as_of_date`. No Blocked Task metric. | `/tasks?view=backlog` with Area and single `status`, `status_group=in-flight`, or `overdue=true`, matching the clicked count. Open Task detail to act; Backlog remains separate from work started. |
| Released communication: where should the reporter situation be reviewed? | Existing Released-update ratio: denominator = Released Tasks with an active `voc→task evidence_of` link to a non-archived VOC; numerator = those with at least one linked non-skipped Public Update. Separate gap = Released Tasks with at least one linked VOC whose reporter status is neither resolved nor closed. | Update complement → Area-filtered Task list with `public_update=missing`; unresolved gap → exact `reporter_update=needed` Task filter. Open Task's approved linked VOC route/review action; publish through VOC, never automatically resolve it. |
| Survey operation/outcome: what needs investigation? | Open Survey count; separate **number of closed Outcome Surveys** with Survey-owned `follow_up_needed=true`. Each Survey contributes at most one, regardless of poor-response count. Reuse the threshold/low-band/resolution classifier of ADR-0055. | `status=open` / `follow_up=needed` → `/surveys` scoped to Area. From the listed Survey open its existing `/surveys/:id/follow-up`; personal actions retain the source gate and read audits. |
| Unclassified context: are the Area numbers incomplete? | The `미지정` row contains the same domain counts/ratios for null classifications; Managed System context shows classified/total counts separately by domain. It is informational, not a missing-work queue. | Each count opens that domain's `filter.analytics_area=unset` list. VOC can be corrected in triage; other records use only an existing permitted owner workflow. Classification is never forced to clear the row. |

#### Attribution and safety

- A VOC/Finding/Task/Survey contributes only to its own current `analytics_area_id`, not every linked Area, source Area, owner team, or inherited name. Cross-Area links within a Managed System remain valid. Coverage is attributed to the metric's source object (VOC for VOC→Task, Finding for handoff, Task for Released communication, Survey for outcome).
- A null Area is valid. Area, slug, and owner team never grant authorization; identical Area names/slugs in different Managed Systems remain separate. Catalog administration permission is not required to read this report.
- Use the owning source authorization seam and its declared Admin rules per metric, including Survey explicit-deny enforcement. For a cross-source metric requiring otherwise unavailable linked facts, omit that metric instead of treating hidden links as absent or returning an “all minus visible” total. Source jumps and actions receive fresh checks.
- Survey results expose no response counts, IDs, scores, answer text, respondent metadata, timestamps, or response-grain actions on this report, even for a personal-read holder. Survey totals count Surveys, not responses. The classifier remains threshold-gated before producing the safe Survey-level signal; no respondent/answer filter or response-derived bucket is introduced.
- Low raw connection coverage alone is not operational failure. Only policy/state-defined gaps get follow-up emphasis. No automatic VOC→Task creation, Survey Response→VOC conversion, Area permissions, or Task→reporter-status mapping is introduced.
- Pending Task Request and Permission Request totals are not Area metrics. `Task Request 검토` opens `/tasks?view=requests&managedSystem=<system>` and clearly represents the whole Managed System review queue.
- Do not average percentages into a composite Area score, sum overlapping gaps as “unique problems,” rank by an invented priority score, or claim release/updates prove outcome improvement. The report has no trend/cohort controls, export workflow, or customizable charts.

#### Acceptance

- A first-time scoped Developer can enter Integration, choose the Area tab, see a real positive gap, open its exact filtered list, perform the permitted source action, and return/refresh to see the gap change without losing scope. An Admin can compare permitted Areas across Managed Systems; a User cannot gain internal visibility via a direct report URL.
- Scope/absence, null/archived attribution, multi-link deduplication, Task date/status boundaries, and Survey safety all pass the route/rendered tests in ADR-0069 → Implementation issues. No displayed action is an unimplemented destination filter.

#### Implementation boundary and non-goals

Dashboard composes approved grouped source reads; Analytics Areas supplies catalog metadata only.
A fixed set of grouped queries and batch metadata reads replaces per-Area, per-record and per-Survey fanout.
Report rows are cursor-paginated (default 50, maximum 100); classification context totals precede Area selection and paging.
The new report requires `computed_at` and a UTC `as_of_date` even while summary recovery detail/history remains separate scheduled work.
Canonical VOC expected-follow-up/no-follow-up resolution is a dependency on the ADR-0059 D3 close-out work,
not report-owned storage. Snooze/history UI is not a dependency for this report.

No Reporter report, new route tree, derived Task Request Area, Area grants, hierarchy, mandatory classification,
backfill, persisted report lifecycle, composite score, trend/cohort controls, export or chart builder.
No stronger claim that every linked reporter has been updated after release. Deferred extensions and reopen conditions
are in `docs/design/14-post-mvp-backlog.md`. Ordered implementation and acceptance are in ADR-0069.

### FR-DASH-003: Show Coverage

Priority: SHOULD

Acceptance Criteria:

```text
- Dashboard displays counts for total objects and linked objects.
- Coverage is clearly labeled as partial integration coverage.
```

## UI / UX Requirements

```text
- Prioritize queues over decorative charts.
- Every dashboard row or card should answer: what should the user do next?
- Use compact lists and drill-in detail panels.
- Avoid BI-style chart overload in MVP.
- Dashboard is an operational queue control surface, not a general analytics workspace.
```

## Permissions

```text
- Basic User may see public or allowed dashboard summaries only.
- Admin and same-scope Developer can see operational dashboards.
- Sensitive survey response and task details follow source permissions.
```

## Cross-System Dependencies

```text
- Requires Entity Links to detect linked and expected-but-missing records.
- Requires Reporter-facing status to detect released tasks with unresolved VOC.
- Requires Outcome Survey links to detect missing validation.
- Requires Managed System scope and default owner rules to show ownership queues.
```

## Out Of Scope For MVP

```text
- Executive report generator
- Advanced BI dashboards
- Free-form BI analysis
- Complex chart drilldown
- Custom dashboard builder
- Export-heavy analytics
```

## Close-out bounded recovery contract (ADR-0067; staged G/H/I)

56-G implements `GET /dashboard/recovery-items` (strict `view=operational|actionable`, default
50/max 100) and `GET /dashboard/recovery-items/:id`, plus required server `computed_at` on
summary/list/detail. Scope/category/current owner repair eligibility precede count and paging.
G strict DTOs contain identity, state, reason/priority/severity, safe source/affected summaries,
current repair intents and derived hints. 56-H adds truthful occurrence, personal presentation, visible/hidden totals and safe
resolution metadata, plus a separately paged history endpoint. Deterministic opaque category/source addresses may return a
readable resolved selection without proof of an earlier gap; they grant no access. Unknown,
foreign, incompatible or unreadable addresses share 404. G's Survey list counts Surveys while
summary retains response counts; this is the explicit parity exception. Empty Survey scopes
fail closed, and generic holder/non-holder reads disclose no personal responses or audits.
Wire format, compatibility and action fields: `docs/implementation/api/dashboard.md`.

The following occurrence/presentation/history capabilities are 56-H backend behavior; the
rendered navigation, hiding controls and computation-time display are implemented by 56-I through `features/integration/public.ts`. Source workflows retain mutation ownership; successful repairs refresh the shared recovery and summary queries.

The six emitted queue IDs/grains are `unassigned-voc` (VOC), `high-severity-unlinked`
(VOC), `actionable-finding-no-execution` (Finding), `released-task-unresolved-voc`
(Task, not one row per VOC), `permission-requests-pending` (workspace Admin Permission
Request), and `bad-outcome-no-followup` (aggregate count with Survey-owned adapter).
The broader example queue wishlist above is not added by this slice.

Stable opaque identity is workspace/category/source; reopening increments occurrence.
One-day/seven-day snooze and current-occurrence mute affect only the session Actor;
provide hidden-items/restore, reset hiding on reopen, never reduce operational counts.
Detail is compact and backend-driven, independently gates affected summaries/source jumps,
and keeps readable resolved selections open. Responsibility hints derive from source
assignment, including safe team/unassigned/multiple-responsible labels, never email or
independent ownership. Integration owns the shared UI/public seam used by Home.

History is three UTC calendar months by resolution time: inclusive first instant of the
current UTC month minus two whole months, with current permission filtering before count/LIMIT.
Visible/hidden list selection also precedes cursor/LIMIT; their sum retains the same authorized
category/System/view matched set, and cursors bind the presentation selector.
Source/link commands atomically record real transitions through a Dashboard recorder;
pg-boss discovers/reconciles drift with truthful observation time. No generic resolve or
GET projection writes, fabricated historical repairs, or audit deletion. Survey response
presentation/history stays Survey-owned behind personal access; non-holders only receive
aggregate count and Survey-level safe navigation/booleans, never response-derived identities.

Coverage has five Admin-editable 75/40 default pairs; empty denominator is neutral
`집계 대상 없음` (`no_data`), whereas unreadable metrics stay omitted.
Changing colors does not change ratios, queues or anonymity. Show last successful server
`computed_at` on Home/Coverage/Integration, including failed refresh states.
Warm summary/list/detail p95 <=500ms and summary p95 <=develop ×1.2+50ms on the same
5k-VOC/5k-Task throwaway dataset; UI criteria and mutation-fanout measurements are locked
in ADR-0067. FE implementation does not establish these budgets: the separate scale worker and conductor own API/fanout measurement, rendered review and the visual harness.
