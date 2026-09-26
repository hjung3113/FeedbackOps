# RESEARCH-6 — Milestone domain (pre-issue)

Read-only survey of the design docs, the two prototype screens, and the dangling `milestone_id` / `linked_milestone_id` columns. No schema, module, or UI was added. Nothing here was verified by tests or a running app.

Status of the requirement, quoted from `docs/design/02-requirements-matrix.md`:

| ID | Title | Status | Owner | Depends on | Primary doc |
| --- | --- | --- | --- | --- | --- |
| FOP-TASK-004 | Manage Task Milestone | SHOULD | Task | FOP-TASK-003 | `06-task-project-system.md` |

SHOULD means "include if cheap and directly supports MVP flow". It is not LATER (Phase 1/2) and not OUT. FOP-TASK-003 (Manage Task) is already shipped, so the dependency is met.

ADR-0027 (`docs/adr/0027-task-domain-and-conversion.md`) says, verbatim:

> Milestone remains deferred. `task.tasks.milestone_id` is a nullable UUID placeholder with no FK until FR-TASK-004 introduces the Milestone table.

That quotation is the ADR. The next two sentences are this note's reading of it, not a paraphrase and not a negation of the quoted line. "Deferred" in that sentence means deferred until FR-TASK-004 introduces the table. It does not mean deferred to Phase 1/2. FOP-TASK-004 is SHOULD, not LATER, and the ADR names that requirement as the change that adds the table. Until the table exists, the column stays the placeholder the ADR describes.

What is missing today: no `milestones` table, no backend module, no frontend route. `view=milestones` is in the route contract and is rejected by the live tasks search schema.

## 1. Domain model (transcribed)

Sources: `docs/design/01-domain-model.md` §Milestone, `docs/design/06-task-project-system.md` (FR-TASK-004, Milestone List And Detail, Permissions), `docs/design/15-data-contracts.md` (Task and Finding only — there is **no** `milestones` object in the data contract), `docs/implementation/02-domain-module-boundaries.md`.

**Definition.** Lightweight Task-system grouping for work larger than one Task. Owner system: Task. Not a Work Initiative, not a Project, not a second Managed System.

**Invariants that are written down.**

- A Milestone can be created when the work is larger than one Task.
- A Milestone belongs to exactly one Primary Managed System in MVP.
- It should show why it exists, and it may reference evidence when that evidence is linked manually.
- Milestone-to-Outcome-Survey validation is a future cross-system workflow (`01-domain-model.md`, repeated by WF-X-004).
- Task has an **optional** Milestone (`06` field list and FR-TASK-003). One Task column, so a Task has at most one Milestone. One Milestone groups many Tasks. That cardinality is the column shape, not a sentence in the domain model, but it is the shape the docs already committed to.
- Standalone is allowed. The prototype has a Milestone with no source Finding, and the domain model does not require a Finding, VOC, or Survey.
- Milestone is internal. Reporter / default User cannot see Task backstage detail (`06` Permissions; `docs/frontend/interaction-patterns.md` §Milestone Timeline Boundary). Reporter-facing copy must not expose Gantt bars, internal Task status, backlog priority, internal due dates, or Developer discussion.
- Canonical cross-system history is `entity_links`. `finding.linked_milestone_id` is explicitly a convenience reference (`15-data-contracts.md`). `milestone` is not an entity-link type today (`packages/shared/src/entity-links.ts`).

**Fields the docs actually name, and where.**

| Field | Where it is specified | Notes |
| --- | --- | --- |
| Why it exists | FR-TASK-004, detail Overview | Prototype field `why`, plain text in `NestedTextBlock`. Not described as TipTap. |
| Primary Managed System | Domain invariant; detail header | Required. Exactly one. |
| Analytics Area | Detail header and list row | Optional elsewhere in the product. Must belong to that Managed System when present (existing Analytics Area rule in `03-api-contracts.md`). |
| Owner | List row and detail header | Prototype `owner` is an actor. The default-owner ladder in `03-api-contracts.md` lists VOC, Finding, Task Request, Task, and Survey — not Milestone. Create must still validate the actor (§6). The default, when the field is omitted, is §7. |
| Status | List row and detail header | **No enum in the design docs or data contract.** The only labels are in the prototype. See §7. |
| Due date | Prose spec header and list row | Prototype stores two dates: `startDate` and `target`. The prose word "due date" matches `target`. |
| Source Finding / VOC / Survey context | FR-TASK-004, Overview | Prototype source is a single Finding id, or none. VOC and Survey appear as evidence excerpts, not as a second owner pointer. |
| Evidence count and linked objects | FR-TASK-004 | Prototype stores `evidenceCount` on the mock. Production Finding already stores `evidence_count`. No milestone evidence table exists. Under slices A–C this stays empty: the only evidence path scoped here is a source Finding, and that writer is blocked (§7 item 1). The domain line "may reference evidence when linked manually" is a separate manual link (§7 item 14), not this column. |
| Reporter-safe summary candidate | `06-task-project-system.md` Milestone Detail → Overview | Named there (`reporter-safe summary candidate`). The prototype Properties block does not show it. The table sketch in §6 has no column for it. See §7 item 13. Do not treat the omission as a decision. |
| Child Tasks | "Milestone can group Tasks" | Existing `task.tasks.milestone_id`. |
| Progress | List row | Not a stored field. Prototype derives it from child Task statuses. |
| Display id | Prototype row id (`M-21`) | Production ids are `core.next_display_id`, prefix plus a counter that starts at 1000 (`TASK-1000`). The prototype `M-` labels are mock. |

**Lifecycle.** Not specified outside the prototype. Prototype `MILESTONE_STATUS_META`:

- `planning` — label "Planning"
- `in_progress` — label "In progress"
- `blocked` — label "Blocked"
- `released` — label "Released"

No transition table. `blocked` has a badge and no sample row and no list tab. This is not the Task status enum (`backlog | todo | doing | review | done | released | reopened`). Do not reuse Task status for the Milestone. Whether a Milestone may be `released` while children are not, and whether a Task may be assigned to an already-`released` Milestone, is not specified. See §7 items 17 and 18.

**Managed System scoping.** Same rule as Task. The Milestone carries one `primary_managed_system_id`. Lists take `managedSystem=<uuid|all>`. `all` is the caller's effective scope, not a workspace bypass (`docs/frontend/routes-and-layout.md`). A Task's Managed System and its Milestone's Managed System are both "exactly one". A cross-system pointer would break both invariants. The docs do not spell the cross-check out; it follows from the two invariants and should be enforced in the service. A foreign key on id alone does not enforce it (Analytics Area is checked the same way today: FK for existence, service for workspace and Managed System).

**Managed System is immutable after create.** `PATCH /milestones/:id` does not accept `primary_managed_system_id`. The whole Task-MS-equals-Milestone-MS check is only in the service, so a later widening of PATCH would silently drop it. Slice A asserts the rejection (§6). The create body field is `primary_managed_system_id`, the column name. It is not a second field called `managed_system_id`. List filters keep the existing query name `managed_system_id`.

**What the data contract does not contain.** `docs/design/15-data-contracts.md` has `tasks.milestone_id` ("nullable, no FK until Milestone domain lands") and `findings.linked_milestone_id` (nullable convenience). It has no `milestones` attribute list. The table sketch in §6 is a transcription of the fields named above, not a hidden contract.

## 2. Prototype is the UI spec

Root `AGENTS.md` §Prototype Is The Spec: layout, hierarchy, density, spacing, and copy come from the rendered prototype. Copy is verbatim, Korean and English together. Behavior and acceptance criteria stay with the design docs. When they disagree, prototype wins for copy and layout, spec wins for behavior. Pack 17 light tokens (ADR-0021) supersede the prototype's dark tokens. Do not port `--color-pitch-black` and the other prototype colors. Do not port hash routing or `window` globals.

`docs/design-prototype/DESIGN-MAP.md` maps `tasks` / `milestones` to **both** files. `HANDOFF.md` says the same. They are one screen split for line count, not two products.

### `screen-milestones.jsx` — list + detail

Route comment: `tasks` view `milestones`. Shell grammar in `routes-and-layout.md`: list-first, selection opens RightDetailPanel, list stays. That is `ListShell`, not a new shell and not `WorkbenchShell` (the board).

**List.**

- Toolbar tabs, verbatim: All, In progress, Planning, Released. Counts per tab. No Blocked tab.
- Search placeholder: `Milestone 검색…`
- A `Filter` button with no menu. Do not invent filter dimensions.
- Primary button: `New milestone`. There is no create-form screen. The fields are the detail properties.
- Summary strip above the rows: `Milestones`, `Tasks in flight`, `Evidence linked`, `Released`, plus `Schedule risk · mini-timeline 우측 표시`.
- Empty copy: `표시할 milestone 이 없습니다.`
- Scope: rows whose Managed System is in the current scope.

**Row** (`MilestoneRow`), left to right: flag icon, display id, title, status badge, Managed System pill, Analytics Area badge, one-line `why`, source Finding id (when present), evidence count, planned-or-real task count, progress percent with `{done}/{total} released`, target date, 200px mini timeline, owner avatar. Selected row stays in the list.

**Detail** (`MilestoneDetailPanel`), anchored sections, not a route change:

1. Overview — title, status, Managed System, Analytics Area, progress strip (`{n} of {n} tasks released`), `Why this milestone exists`, Source, Properties (Status, Managed System, Analytics Area, Owner, Start, Target, Created).
2. Timeline — `TaskGantt` only. The screen comment quotes the spec: the full Gantt is this section, not a page.
3. Tasks — `Tasks · {n}`, `Add task`, child rows. Empty: `아직 연결된 Task 가 없습니다.` `MilestoneTaskRow` (`screen-milestones.jsx`) starts with a `SeverityIndicator` driven by `task.priority`, then display id, title, internal status badge, `estimate`, `updated`, assignee. The earlier pass listed "id, title, internal status, estimate, updated, assignee" and dropped priority. `06-task-project-system.md` (Milestone Detail → Tasks) says "status, assignee, priority, and due date". Prototype shows priority + estimate + updated. Spec says priority + due date. `estimate` is not a field in `15-data-contracts.md` or `apps/backend/src/db/schema/task.ts`. Root `AGENTS.md`: prototype wins layout and copy, spec wins behavior. That conflict needs a call before the Tasks section is built (§7 item 12). Do not add an `estimate` column to make the prototype row type-check.
4. Evidence — highlights (quote, id, source). Empty: `연결된 evidence highlight 가 없습니다.` Then an Outcome validation block (see out of scope).
5. Activity — actor, action, timestamp. Empty: `활동 기록이 없습니다.` Plus a linked-entity trail. There is no audit read path to fill this (§7 item 9). The empty copy can ship. The feed cannot ride along with create/update audit writes.

Source empty state, verbatim: `근거 Finding 이 연결되어 있지 않습니다. Standalone milestone 으로 운영 중입니다.` Action label: `Link source finding`.

Header actions are the shared detail-panel actions (copy link hash in the prototype). Section nav labels: Overview, Timeline, Tasks, Evidence, Activity.

Progress in the prototype counts **uncreated** `plannedTasks` in the denominator and treats Task `done` and `released` as the numerator. `reopened` is not in any bucket. Those two facts matter in §7.

### `screen-milestone-gantt.jsx` — visualization only

Loaded before the screen. Exports `MilestoneMiniTimeline`, `TaskGantt`, `milestoneTaskRows`.

- Mini timeline: milestone `startDate` → `target`, up to 3 lanes of thin bars, today marker. Scan affordance. Title tooltip is the range and the task count. It must not replace the detail (`routes-and-layout.md`, `interaction-patterns.md`).
- Full Gantt: weekly ticks, today line, one row per child. Bar color is **internal Task status**. Legend, verbatim: Doing, Review, Done/Released, Todo/Backlog, Planned. Fill inside a bar is how far "today" sits between that task's start and end, which is a different number from the list percent.
- `TASK_BAR_COLORS.reopened` is warning-red (`--color-warning-red` in `screen-milestone-gantt.jsx`). The legend has no Reopened entry. Same open question as where `reopened` sits in the progress buckets (§7 item 4). Do not paint that bar and leave the legend silent without recording the choice.
- `TASK_SCHEDULES` is mock `{ start, end }` per task display id. If a task has no mock schedule, the bar falls back to the milestone range.
- `plannedTasks` render as dashed bars with status `planned`. They are not Tasks. Nothing in the domain model or data contract describes an uncreated task.

### Not this requirement

`screen-tasks-roadmap.jsx` is a third surface: every Milestone on one shared axis, group by Managed System / status / none, slide-over detail. `HANDOFF.md` cites FR-TASK-005 and `/tasks/roadmap`. `DESIGN-MAP.md` records that FR-TASK-005 is not in `06-task-project-system.md` and that the path is not in the route contract. Status there: `prototype-only`. The prototype shell also has a Roadmap nav item (`shell.jsx`). Do not build it in this work.

`screen-tasks.jsx` already shows a Task-side Milestone filter (`Milestone 있음` / `Milestone 없음`) and a Milestone field on Task detail. Production board filter matches that any/none pair and does not list Milestones, because there is no catalog (`TaskBoardRoute.tsx`). `screen-findings.jsx` has a `Create Milestone` button next to Request Task and Link existing Task. That button is the WF-TASK-002 entry. See the stop-and-report below before building it.

`shell.jsx` nav label for this view is `Milestones` (`view: 'milestones'`). Production `NAV_TREE.tasks` has Task Requests, Tasks (board), and My Tasks only (`apps/frontend/src/routes/_authed.tsx`).

## 3. Explicitly out, even for a "full" Milestone

### FOP-OUT-013 — Work Initiative

`02-requirements-matrix.md`: "Work Initiative as required MVP execution grouping" is OUT. Replacement: "Lightweight Task Milestone inside Task system".

Do not add `work_initiatives`, a Project table, or a parent grouping above Milestone. `docs/implementation/04-database-and-migrations.md` still lists `work_initiatives / projects when future execution grouping is introduced` **and** `milestones when future execution grouping is introduced` as sibling future tables. The Work Initiative half stays future. The Milestone half is stale relative to ADR-0027 and FOP-TASK-004. The ADR sentence is quoted in the status block above: the table is what FR-TASK-004 introduces. An ADR supersedes that implementation doc on this point. Fix the Milestone sentence in the same chunk as the migration. Leave the Work Initiative sentence.

`apps/backend/src/modules/tasks/AGENTS.md` already says the same thing: Task owns Milestone; Work Initiative / Project only after MVP if needed.

### FOP-OUT-014 — automatic outcome-survey validation

"Automatic Milestone Outcome Survey validation in MVP" is OUT. Replacement: "Manual Task/Milestone follow-up; outcome validation is future cross-system workflow."

Same boundary, other docs:

- WF-X-004 (`docs/design/10-cross-system-workflows.md`): future, not MVP core. Milestone Released → Outcome Survey → result → Finding / Task Request or "validate milestone outcome".
- `08-dashboard-system.md`: "Milestone-to-Outcome-Survey gap detection is a future cross-system workflow, not an MVP action queue."
- `apps/backend/src/modules/dashboard/service.ts` omits coverage id `milestone-outcome` on purpose. The integration test asserts the id is absent.
- `docs/implementation/api/dashboard.md` says the id is absent until there is a Milestone table **and** a filter. Do not read that sentence as "the table landing turns the metric on". The design doc is more specific: the gap detector stays future. The shared Zod enum still lists `milestone-outcome` (`packages/shared/src/dashboard.ts`) so the id can be omitted rather than rejected. Leave that omission in place.

The prototype still draws Outcome validation inside Evidence: `Outcome survey 연결됨`, and for a released Milestone with none, callout `Outcome survey 없음` / `Released 상태이지만 효과 확인용 Outcome Survey 가 연결되어 있지 않습니다.` with `Create outcome survey`. Spec wins for behavior. Do not add `outcome_survey_id`, do not add that callout, do not create a survey from a Milestone. `08-dashboard-system.md` also lists "Milestone 진행률" as a Task Dashboard grouping and calls Milestone progress an MVP dashboard grouping. That is progress of child Tasks, not outcome coverage. It is not an FR-TASK-004 acceptance criterion. Treat it as a later dashboard slice, not part of the three below.

### Also out, from nearby docs

- Jira-style workflow customization, sprint/cycle automation (`06` Out Of Scope; FOP-OUT-005).
- Per-Managed-System route trees or a `features/milestones` top-level feature. The route is `/tasks?view=milestones`. Frontend feature ownership follows the top-level route, so the UI lives under `apps/frontend/src/features/tasks/`.
- `POST /survey-findings/:id/link-milestone`, marked future in `docs/implementation/api/surveys.md`.
- Planned / uncreated tasks and the dashed "Planned" Gantt legend. Prototype-only.
- The roadmap page.

## 4. Dangling references today

Two columns, neither has a foreign key.

**`task.tasks.milestone_id`.** Drizzle comment in `apps/backend/src/db/schema/task.ts` (lines 35–37): "Milestone domain is deferred for MVP. Keep nullable UUID placeholder without FK until FR-TASK-004 introduces the table." Migration `0025_task_domain.sql` created it as `uuid NULL` with no `REFERENCES`. Sibling columns on the same table (`analytics_area_id`, `assignee_actor_id`, `source_task_request_id`) do have FKs.

**`finding.findings.linked_milestone_id`.** `apps/backend/src/db/schema/finding.ts` — `uuid('linked_milestone_id')` with no `.references()`. `0020_finding_foundation.sql` created it the same way. `linked_task_id` is also an unscoped uuid; that is a separate column and not this work.

| Location | What it does |
| --- | --- |
| `apps/backend/src/db/schema/task.ts` | Declares the nullable column. No FK, no index. |
| `apps/backend/migrations/0025_task_domain.sql` | Created the column. |
| `apps/backend/src/modules/tasks/repo.ts` | `TaskRow.milestone_id`. `insertTask` writes the caller-supplied uuid straight into the column. `TASK_SELECT` returns it. No existence check. |
| `apps/backend/src/modules/tasks/service.ts` | `taskToDto` copies `milestone_id` onto `TaskDto`. `convertTaskRequest` sets `milestoneId: args.input.milestone_id ?? null` after the Analytics Area check and before insert. No Milestone lookup. The audit detail does not mention it. |
| `apps/backend/src/modules/tasks/__tests__/_seed-helpers.ts` | Optional seed override. Default null. |
| `apps/backend/src/modules/tasks/__tests__/task-conversion.integration.test.ts` | One case sends `milestone_id: null`. |
| `packages/shared/src/tasks/index.ts` | `taskDtoSchema.milestone_id` is `uuid \| null`. `convertTaskRequestRequestSchema.milestone_id` is optional nullable uuid. `listTasksQuerySchema` has no milestone filter. |
| `apps/frontend/src/features/tasks/routes/task-requests/useTaskRequestConversion.ts` | State `convertMilestoneId` exists and is reset to `''`. Submit **always** sends `milestone_id: null`. |
| `apps/frontend/src/features/tasks/routes/task-requests/TaskRequestPanel.tsx` | Visible label `Milestone`, hidden input, text `Later slice`. |
| `apps/frontend/src/features/tasks/routes/TaskBoardRoute.tsx` | Client filter only: `__any` means `milestone_id !== null`, `__none` means null. Options are those two labels, not a catalog. |
| `apps/frontend/src/lib/api/tasks.ts` | `listTasks` does not send a milestone query param. |
| `apps/backend/src/db/schema/finding.ts` | `linkedMilestoneId` nullable, no FK. |
| `apps/backend/migrations/0020_finding_foundation.sql` | Created `linked_milestone_id`. |
| `apps/backend/src/modules/findings/repo.ts` | Every `SELECT` / `RETURNING` list includes `linked_milestone_id`. `insertFinding` does **not** write it (column default null). No update path sets it. |
| `apps/backend/src/modules/findings/repo-read.ts` | Maps the column onto the read row. |
| `apps/backend/src/modules/findings/service-shared.ts` | Copies it onto `FindingDto`. |
| `apps/backend/src/modules/voc-clusters/conversion.ts` | Create-finding response copies `finding.linked_milestone_id` through. It does not set it. |
| `packages/shared/src/findings/index.ts` | `linked_milestone_id: uuid \| null` on the Finding DTO. |
| Frontend fixtures and Finding tests | Hard-coded `linked_milestone_id: null`. No UI reads it. |
| `apps/backend/src/modules/dashboard/service.ts` | Does not read the column. Omits `milestone-outcome`. |

`entity_links` cannot point at a Milestone. `entityLinkEntityTypeSchema` is `voc | survey_response | finding | voc_cluster | task_request | task`. The DB check in `0039_survey_response_evidence_access.sql` matches that list. No relation name for Finding→Milestone exists in `docs/design/11-entity-linking.md`.

Display ids cannot name a Milestone yet. `core.next_display_id` (`0036_survey_foundation.sql`) allows `task | finding | cluster | task_request | survey` and prefixes `TASK-`, `FIN-`, `CLU-`, `REQ-`, `SRV-`. Unknown types raise.

## 5. Conversion soft gap

`docs/implementation/api/tasks.md` Task Conversion Contract, `POST /task-requests/:id/convert`:

```text
milestone_id optional nullable uuid
```

Validation errors listed there cover a non-approved request and a bad Analytics Area. They do not mention an unknown `milestone_id`. The service (`tasks/service.ts` `convertTaskRequest`) checks `finding.manage`, checks the request is approved, checks the Analytics Area, then inserts `milestone_id` as given. A random uuid is stored. Null is stored. The frontend never sends a non-null value (`Later slice`), so the gap is latent, not exercised by the UI.

When the table exists, this path has to reject an unknown id, a cross-workspace id, and a Milestone on another Managed System, using the same error style as Analytics Area (`404 not_found.record`, `422 validation.failed` / `out_of_scope`). Null stays valid: the field is optional. That check is part of slice A, not a follow-up, because the FK makes a dangling uuid a migration failure and a runtime integrity bug.

`PATCH /tasks/:id` is status-only (`.strict()`). Attaching a Milestone to an existing Task is not a widening of that body.

## 6. Rough design

Faithful to the docs above. Choices that are not written down are marked as proposals in §7 and are not part of the acceptance criteria. §8 is only the list of stale lines to fix with the implementation.

### Backend module

New directory `apps/backend/src/modules/milestones/`, sibling of `tasks/` and `task-requests/`, not a folder inside `tasks/`. Task-requests is already a separate directory while `tasks/AGENTS.md` keeps logical ownership with Task. Match the CRUD shape of `tasks/`, not the split services in `permissions/`:

```text
apps/backend/src/modules/milestones/
  index.ts          createMilestonesService + milestonesRoutes
  routes.ts         HTTP parse and map only
  service.ts        transaction, permission, audit, idempotency
  repo.ts           writes task.milestones only
  __tests__/        integration, one concept each
packages/shared/src/milestones/index.ts
docs/implementation/api/milestones.md
```

Register routes in `apps/backend/src/server.ts` the same way `tasksRoutes` is registered (session, workspace, read/mutation rate limit). Export the drizzle table from `apps/backend/src/db/schema/index.ts`.

Postgres schema is the existing `task` schema (`pgSchema('task')` in `schema/task.ts`). Do not create a new database schema.

`apps/backend/src/__tests__/module-seams.test.ts` `FORBIDDEN_REPO_TARGETS` is `findings/repo`, `findings/repo-read`, `entity-links/repo`, and `task-requests/repo`. It does **not** include `tasks/repo`. A milestones module that imported `tasks/repo` would pass that test today. The milestone module boundary is not enforced. Slice A adds `tasks/repo` and `milestones/repo` to that set, so the seam is a failing test and not an honor system. The milestones module also must not import the four names already in the set. The Task column stays owned by the tasks module. The Finding column stays owned by the findings module.

Cross-module reads in this repo are an exported function from the owning module's `index.ts` or `commands.ts`, not a constructed service object passed into the caller. `tasks/service.ts` imports `linkTaskToFinding` from `findings/commands.js`, `lockAnalyticsArea` from `analytics-areas/index.js`, and `lockManagedSystem` from `managed-systems/index.js`. Milestone follows that shape:

- Source Finding on the detail DTO: a reader exported from `findings/index.ts` or `findings/commands.ts` (findings whose `linked_milestone_id` equals this id). `milestones/service.ts` imports that function. It does not take a findings service dependency, and `milestones/repo.ts` does not select from `finding.findings`.
- Child-task counts for the list page: one grouped query exported from the tasks module, `COUNT … FILTER (WHERE status IN …) GROUP BY milestone_id`, called once for the visible milestone ids. Not `GET /tasks?milestone_id=` once per row. `listTasks` already checks `finding.manage` per row; repeating that per milestone would be N times M permission checks. `milestones/repo.ts` does not select from `task.tasks`.

The per-milestone child list (`GET /tasks?milestone_id=`) stays a tasks-module list. It is the Tasks section and the Gantt, where one permission-checked fetch is the right cost. It is not the list-page aggregate.

Permission, matching Task list/detail (`tasks/service.ts` `listTasks` / `getTask`): caller must be an elevated role, and each row requires `finding.manage` on that row's Primary Managed System. Admin bypass is the existing Finding-action bypass. Out-of-scope rows are omitted from lists, not a list-wide 403. A direct read of an out-of-scope id is `permission.denied`. Reporter / User fails the elevated-role check. No new capability. `06` says Task conversion reuses `finding.manage` until a Task-specific capability is approved; Milestone is the same Task surface.

Mutations take `Idempotency-Key`, hashed with the body and a route identity, same as Task commands. Status and field updates take `If-Match` on `updated_at`, same as `PATCH /tasks/:id` (`requireIfMatchTimestamp`). No hard delete, and no `DELETE` grant for `fops_app`. `task.tasks` is `SELECT, INSERT, UPDATE` for `fops_app`. Match that. `fops_migrate` keeps ownership and `GRANT ALL`.

Audit event names are not specified. Register new ones in the shared audit registry in the same change, in the style of `task_created_from_request`. Do not invent a `milestone_comments` table. ADR-0049 progress notes are Finding and Task only.

### Table sketch

`task.milestones`. Types follow neighboring tables. Length limits and the status transition graph are not specified; see §7. `primary_managed_system_id` is written on create and never updated. `reporter-safe summary candidate` is not a column here (§7 item 13).

```text
id                          uuid pk default gen_random_uuid()
workspace_id                uuid not null → core.workspaces
display_id                  text not null          -- core.next_display_id
primary_managed_system_id   uuid not null → core.managed_systems
title                       text not null
why                         text not null          -- "Why this milestone exists"
status                      text not null default 'planning'
                            check (planning, in_progress, blocked, released)
owner_actor_id              uuid not null → core.actors
analytics_area_id           uuid null → core.analytics_areas
start_date                  date not null          -- prototype startDate
target_date                 date not null          -- prototype target; prose "due date"
created_by                  uuid not null → core.actors
created_at                  timestamptz not null default now()
updated_at                  timestamptz not null default now()

unique (workspace_id, display_id)
index (workspace_id, status)
index (workspace_id, primary_managed_system_id)
```

Not on this table: `outcome_survey_id`, `evidence_count` (derive), `progress` (derive), `source_finding_id` (the convenience column that already exists is `finding.findings.linked_milestone_id`), planned-task rows, Work Initiative id.

`why` is plain text because the prototype renders `NestedTextBlock` and no doc calls this field rich content. Do not introduce TipTap here.

Display id: extend `display_counters_entity_type_chk` and the `CASE` in `core.next_display_id`. Counter default is already 1000. The prefix is the one open token; it must not be the prototype's `M-`. `TASK` / `FIN` / `CLU` / `REQ` / `SRV` are the existing shape. Pick one unused short prefix in that function and record it in the migration. Do not display prototype ids.

### Migration sketch

Next file after `0048_finding_task_comments`. Register it in `apps/backend/migrations/meta/_journal.json` in the same chunk. One migration, roughly:

1. `CREATE TABLE task.milestones` as above. Grants as above.
2. Widen `core.next_display_id` and the display-counter check. `GRANT EXECUTE` to `fops_app` again, owner `fops_migrate`, matching `0036`.
3. Attach the foreign keys that were deferred:
   - `task.tasks.milestone_id` → `task.milestones.id` `ON DELETE RESTRICT`
   - `finding.findings.linked_milestone_id` → `task.milestones.id` `ON DELETE RESTRICT`
4. `CREATE INDEX` on `task.tasks (milestone_id)` so list-by-milestone is not a seq scan. Partial index `WHERE milestone_id IS NOT NULL` is enough.
5. Delete the "deferred for MVP" comment on the drizzle column when the FK lands.

This is FK attachment, not a data backfill. No application path writes a real Milestone id (`insertFinding` leaves the Finding column null; convert sends null unless a client bypasses the UI). Before `ADD CONSTRAINT`, count non-null values in both columns. If the count is not zero, stop. Those uuids do not identify a row, and inventing Milestone rows for them would be worse. Do not `UPDATE … SET milestone_id = NULL` to force the migration through.

The FK proves the id exists. It does not prove same workspace or same Managed System. The service check does that, on convert and on later assign.

Do not touch `entity_links_tuple_check` in this migration. A new tuple belongs only to a later decision: the blocked Finding → Milestone path (§7 item 1) or a manual Milestone↔evidence link (§7 item 14). Neither is this migration.

### API sketch

Contract file: `docs/implementation/api/milestones.md`, using the template in `docs/implementation/03-api-contracts.md`. Shared Zod in `packages/shared`. Routes parse and map only.

Auth for every route below: session + workspace, elevated role, `finding.manage` on the Milestone's (or the Task's) Primary Managed System. Create requires `primary_managed_system_id` in the body — the column name, the same value the scoped-create rule in `03-api-contracts.md` calls `managed_system_id` for VOC, Finding, Task Request, Task, and Survey. Milestone is missing from that list; slice A adds it (§8). Do not also accept a field named `managed_system_id` on this body.

Do not copy a `POST /tasks` handler as the template. `03-api-contracts.md` documents standalone `POST /tasks`. `apps/backend/src/modules/tasks/routes.ts` does not register it. The routes that exist are `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id` (status only), `GET` and `POST /tasks/:id/comments`, `POST /task-requests/:id/convert`, and `POST /task-requests/:id/link-task`. Copy the header, idempotency, and error style from those handlers. There is no create-task route to mirror.

Analytics Area, when present, must be in that Managed System, not archived (`404` unknown or cross-workspace, `422 out_of_scope`, `409 parent_archived` — copy the Analytics Area errors on convert).

`owner_actor_id`, when the client sends it, must name an actor that exists in the workspace, is an elevated role, and has `finding.manage` on this Milestone's Primary Managed System. Unknown or other-workspace actor: `404 not_found.record`. Actor in the workspace without that permission: `validation.failed`. That is the outcome `03-api-contracts.md` already requires when a resolved owner lacks Managed System scope. The field is not validated anywhere in the current sketch unless this check is written. When the field is omitted, default the creating actor (§7 item 5). The creator already passed the same check, so the default is not a second lookup with a weaker rule. The column is `NOT NULL` either way. Do not store an unchecked uuid. Task `assignee_actor_id` is unvalidated on convert today; do not copy that gap.

**`GET /milestones`**

```text
requirement_id: FOP-TASK-004
query:
  managed_system_id  optional uuid | all
  status             optional planning|in_progress|blocked|released
response: { items: MilestoneDto[] }
side effects: none
audit: none
entity_links: none
dashboard: none
idempotency: n/a
```

`MilestoneDto`: the columns above, plus `display_id`, timestamps as ISO. Progress on the list DTO comes from the tasks-owned grouped aggregate described above (one query for the page, not one `GET /tasks?milestone_id=` per row, and not a client fan-out). `milestones/repo` does not select from `task.tasks`. The aggregate is an exported function from `tasks/index.ts` or `tasks/commands.ts`. `milestones/service.ts` imports it.

**`GET /milestones/:id`**

```text
requirement_id: FOP-TASK-004
response: MilestoneDetailDto
  milestone fields
  progress: { released_done, in_flight, queued, total, percent }  -- derived, real Tasks only
  source_finding: null | { id, display_id, title, summary, evidence_count }
    -- findings reader exported from findings/index.ts or findings/commands.ts
    -- rows whose linked_milestone_id equals this id; empty until a writer exists
    -- not a findings-service dependency, and not a select inside milestones/repo
side effects: none
```

Evidence highlights and the Activity feed are not a new table. Evidence for slices A–C is the empty copy. The source Finding's highlights appear only after a Finding writer exists, and that writer is blocked (§7 item 1). A manual Milestone↔evidence link, which the domain invariant allows without a Finding, is also not in these slices (§7 item 14). Shipping the empty Evidence state does not meet FR-TASK-004's "evidence count and linked objects".

Activity is not "read the audit rows if that read already exists." It does not exist. `apps/backend/src/modules/core/audit/audit-service.ts` exports `createAuditService`, and that returns only `record()`. No module and no route reads `audit_log`. The Activity section needs its own read path in `core/audit` and its own permission decision. It is not part of slice A or B. Slice A still writes one audit row per create and per update. That write does not unlock the feed. Do not add Milestone progress notes to satisfy the Activity section. The empty copy can ship with the detail panel. The feed cannot.

**`POST /milestones`**

```text
requirement_id: FOP-TASK-004
request:
  title                     required text
  why                       required text
  primary_managed_system_id required uuid
  owner_actor_id            optional uuid   -- omitted: default the creating actor (§7 item 5)
                                -- present: actor exists in the workspace, elevated,
                                --   finding.manage on this Milestone's Managed System
  analytics_area_id         optional nullable uuid
  start_date                required ISO date
  target_date               required ISO date
  status                    optional, default planning
response: 201 MilestoneDto
side effects: insert task.milestones, allocate display id
audit: one create event
entity_links: none
idempotency: Idempotency-Key required
```

Does not create Tasks. Does not link a Finding. Does not link evidence. "New milestone" on the list is this call. The button and the editable detail properties that submit this call and `PATCH` are slice B2. No earlier slice draws them.

**`PATCH /milestones/:id`**

```text
requirement_id: FOP-TASK-004
headers: Idempotency-Key, If-Match <updated_at>
request: any of title, why, status, owner_actor_id, analytics_area_id,
         start_date, target_date. Strict object, at least one field.
         primary_managed_system_id is not a field. .strict() rejects it.
response: 200 MilestoneDto
conflict: stale If-Match, current updated_at returned, no merge
side effects: update the row
audit: one update event, from/to for status when status changes
entity_links: none
```

`primary_managed_system_id` is immutable. Slice A includes a test that a PATCH body containing that key is `validation.failed` and does not write. `.strict()` is what rejects it; the test must assert the rejection, not assume the schema keyword is enough of a record. `owner_actor_id` on PATCH uses the same actor check as create.

No guarded transition table exists. Proposal in §7 item 2: an authorized PATCH may set any of the four prototype statuses. Do not invent guards. That proposal does not say what happens to child Tasks (§7 items 17 and 18).

**`GET /tasks?milestone_id=<uuid>`** — extend `listTasksQuerySchema` and `listTasksByWorkspace`. Same auth as `GET /tasks`. This is the child-task list for the Tasks section and for the Gantt. Owned by the tasks module.

**Assign / unassign**, tasks module, not a change to the status PATCH body:

```text
POST /tasks/:id/milestone
requirement_id: FOP-TASK-003 (optional Milestone on a Task) + FOP-TASK-004
headers: Idempotency-Key, If-Match
request: { milestone_id: uuid | null }
response: TaskDto
validation:
  null unsets
  unknown or other workspace: 404 not_found.record
  other Managed System: 422 out_of_scope on milestone_id
side effects: update task.tasks.milestone_id only
audit: record the from/to milestone id
entity_links: none
```

**`POST /task-requests/:id/convert`** — same body as today. Add the existence / workspace / Managed System checks before `insertTask`. Update `docs/implementation/api/tasks.md` validation list in the same change. The frontend stops hard-coding null once slice B3 has a picker.

Not in this contract: `POST /findings/:id/create-milestone`, roadmap, outcome survey, dashboard `milestone-outcome`.

### Frontend sketch

Files under `apps/frontend/src/features/tasks/`. Route file `apps/frontend/src/routes/_authed/tasks.tsx`.

- Add `'milestones'` to `tasksSearchSchema.view`. Today the enum is `requests | backlog | board | my | inbox`, and `.strict()` rejects `milestones` (`DESIGN-MAP.md` calls this `contract-only`).
- Selection. The route contract says `selected=:milestoneId`. Shipped task views use `param`, and `DESIGN-MAP.md` already records that disagreement. Use `param` for this view too. Do not add a third key, and do not retcon `selected` onto the other task views in this work.
- `action=review_timeline` is in `routes-and-layout.md` and is not in the zod schema. Optional on the Gantt slice: scroll the Timeline anchor. Do not add `action` handling to other views.
- `TasksRouteView` branches to a new list route component inside `ListShell`, detail in the existing right panel.
- Sidebar: one `NAV_TREE.tasks` entry, label `Milestones`, href `/tasks?view=milestones`. Do not add Roadmap. Do not add a count badge unless a backing `/nav/counts` key is part of the same change. `docs/implementation/api/navigation.md`: an absent key is not zero, and it may be permission-shaped. `AppSidebar` already omits the badge when `counts[countKey]` is missing (`count !== undefined` in `AppSidebar.tsx`; the unit test is "distinguishes an absent count from an explicit zero count"). If a Milestone badge is added, a missing key renders as absent, not as `0`. Current emitted keys do not include a milestone key. Adding one means a real list filter in `nav/service.ts`, not a hardcoded zero.
- Copy and section order from §2, verbatim. Tokens from the implementation theme, not the prototype dark palette.
- List mini-timeline and detail `TaskGantt` are the Gantt slice. Until per-task ranges exist, do not fake `TASK_SCHEDULES`.
- Task board filter can keep `__any` / `__none`. A catalog of Milestones in that filter is slice B3, and only if the prototype's any/none pair is preserved (it is what `screen-tasks.jsx` shows).
- Convert panel: replace `Later slice` with a select of in-scope Milestones on the request's Managed System, plus None. None still submits `milestone_id: null`. This is slice B3, not B2.
- Task detail Milestone row: show the Milestone display id and title, or `—`. Prototype `screen-tasks.jsx` uses the label `Milestone`. Slice B3.
- Finding `Create Milestone` button: not in slices A–C. See §7 item 1.
- The list/detail screen (slice B2) includes a visual fixture and a spec under `apps/frontend/tests/visual` in its acceptance, not as a follow-up. See slice B2. The shared files that work touches — `AppSidebar`, `apps/frontend/vite.config.ts`, and `apps/frontend/tests/visual/support/mock-api.ts` — are in that slice's file list from the start. `AppSidebar.tsx` and `mock-api.ts` already have lines in `scripts/gates/frontend-biome-allowlist.txt`. Do not drop those lines, and do not discover them after the screen is built.
- `features/tasks` is the feature folder. A top-level `features/milestones` would break route ownership.

Detail sections to build, mapped to data:

| Section | Data | Slice |
| --- | --- | --- |
| Overview, why, properties, status | `MilestoneDetailDto` | B2. Editable properties submit `PATCH`. `New milestone` submits `POST`. Reporter-safe summary candidate is not here until §7 item 13 is decided. |
| Source | `source_finding`, empty state copy when null | Empty copy in B2. A real Finding only after the blocked Finding slice (§7 item 1). |
| Timeline | child Tasks from `GET /tasks?milestone_id=` | Slice C, after the date decision (§7 item 3). |
| Tasks | same child list, no Gantt | B2 renders the section from B1's child list. Columns are §7 item 12, not a silent copy of `estimate`. |
| Evidence | empty copy | Empty copy in B2. That does not meet the evidence AC. Source-Finding highlights wait on §7 item 1. A manual link waits on §7 item 14. |
| Activity | empty copy only | Empty copy in B2. The feed is not A or B. It waits on a new audit read path (§7 item 9). |
| Outcome validation | — | Do not build |

### Sub-scopes

Slices A, B1, B2, and C, plus an optional B3. They deliver FR-TASK-004 only in part. Do not mark FOP-TASK-004 done when they land.

The acceptance criteria in `06-task-project-system.md` (FR-TASK-004), in order:

1. "Milestone can be created from Finding." Blocked. Stop-and-report, §7 item 1. A–C do not build it.
2. "Milestone can group Tasks." B1 (assign) plus the FK from slice A.
3. "Milestone Detail shows Why this milestone exists, source, Analytics Area, evidence count, and linked objects." Only partly. Why, the source empty state, and Analytics Area ship in B2. Evidence count and linked objects stay empty for every Milestone these slices can create. The only evidence path scoped here is a source Finding, and that writer is the blocked slice. The domain invariant — "may reference evidence when linked manually" (`01-domain-model.md`) — is a manual Milestone↔evidence link independent of the Finding workflow. It needs its own `milestone` entity-link type (§7 item 14). An empty Evidence section is not this criterion.
4. "Milestone lists show compact schedule risk with a mini timeline." Slice C.
5. "Milestone Detail includes a Timeline section with a child Task Gantt chart." Slice C, still waiting on §7 item 3.

Report the requirement as partially delivered while criterion 1 and the evidence half of criterion 3 are open.

**Slice A — Backend Milestone CRUD and FK attachment.** Table, display id, module, shared DTO, list/get/create/patch, audit writes, `finding.manage`, `owner_actor_id` validation, convert-time existence check, both FKs, index, journal entry, `api/milestones.md`, the stale sentence in `04-database-and-migrations.md`, the column comment, Milestone added to the scoped-create list in `03-api-contracts.md`, and `tasks/repo` plus `milestones/repo` added to `FORBIDDEN_REPO_TARGETS` in `module-seams.test.ts`. No Finding writer, no Gantt, no outcome metric, no Activity read, no list or create UI. Integration tests: create in scope, omit out-of-scope rows, reject cross-Managed-System Analytics Area, reject unknown `milestone_id` on convert, still accept null, User denied, PATCH body containing `primary_managed_system_id` is `validation.failed` and does not write, `owner_actor_id` rejected when the actor is missing or lacks `finding.manage` on the Milestone's Managed System.

**Slice B1 — Backend linking and the list aggregate.** `GET /tasks?milestone_id=`, assign/unassign command, and the grouped child-task aggregate exported from the tasks module (one `COUNT … FILTER … GROUP BY milestone_id` for the page, not a permission-checked fetch per row). Progress percent from real child Tasks only: numerator `done` + `released`, denominator child count, 0 when empty. Where `reopened` sits is §7 item 4. No UI.

**Slice B2 — List, detail, and create/edit UI.** This slice owns the screen. `/tasks?view=milestones` list and detail without a faithful Gantt (the Tasks section is B1's child list). Nav item `Milestones`. The prototype's `New milestone` button and the editable detail properties (status and the other PATCH fields) live here. No earlier slice draws them, and they are not a leftover. Copy and section order from §2. Activity and Evidence ship their empty copy only.

Acceptance for B2 includes the visual harness, not a follow-up note. A fixture and a spec under `apps/frontend/tests/visual`, plus a baseline in the same change (root `AGENTS.md`: every new screen needs fixture + spec). The file list names these from the start, because the screen cannot land without them: `apps/frontend/src/lib/layout/AppSidebar.tsx` (the nav entry), `apps/frontend/vite.config.ts`, and `apps/frontend/tests/visual/support/mock-api.ts`. `AppSidebar.tsx` and `mock-api.ts` already have lines in `scripts/gates/frontend-biome-allowlist.txt`. Keep those lines. Do not treat a gate hit on those three files as a surprise after the screen is built, and do not add a new allowlist line unless the diagnostic is pre-existing and the reason is written the way that file requires.

If a Milestone count badge is added on that nav entry, `docs/implementation/api/navigation.md` applies: an absent `/nav/counts` key is not zero. `AppSidebar` already hides the badge when the key is missing. Do not coerce a missing key to `0`. No badge unless the key has a backing list filter.

**Slice B3 — optional, convert picker and the Task detail row.** Replace `Later slice` with a select of in-scope Milestones on the request's Managed System, plus None. Task detail shows the Milestone display id and title, or `—`. Keep this out of B2. B2 is already the new route, the nav entry, the list, the detail panel, and create/edit. Folding the picker and the Task row back in is how the old slice B got too big. B3 can wait until B2's catalog exists. It does not block B2.

**Slice C — Mini timeline and detail Gantt.** Only the two prototype atoms. Depends on a decision about per-task dates (§7 item 3). `TASK_BAR_COLORS.reopened` has no legend entry (§7 item 4). Does not include `screen-tasks-roadmap.jsx`.

**Not scheduled — Finding → Milestone.** FR-TASK-004 says "Milestone can be created from Finding." WF-TASK-002 labels that path "Future cross-system workflow, not MVP core." `docs/implementation/api/findings.md` says "Finding-to-Milestone linking is future cross-system behavior and is not an MVP Finding endpoint." FR-X-003 says Finding Detail offers Request Task / Link Existing Task, and "Create Milestone is future cross-system behavior when enabled." Those are design vs implementation / cross-system vs system-doc statements. No tiebreak covers them. Do not start this slice until that is reopened. If it is approved later, it needs a new entity type `milestone`, a registered pair (the relation name is not written anywhere), a widening of `entity_links_tuple_check`, `findings.linked_milestone_id` set by the findings module, and an entity link written through the entity-links seam. The prototype button label is `Create Milestone`. This slice is not the manual evidence link in §7 item 14. That one also needs a `milestone` entity type, and it does not require the Finding writer.

**Not scheduled — Activity feed and manual evidence.** The audit read path (§7 item 9) and the manual Milestone↔evidence link (§7 item 14) are each their own decision. They are not absorbed into A, B1, B2, or C.

Dashboard "Milestone 진행률" stays off this list. It is a different doc (`08-dashboard-system.md`) and it is not outcome coverage.

## 7. Undecided — do not paper over

1. **Finding → Milestone.** Stop-and-report, above. Slices A–C do not depend on it. The FKs can land with no writer on `linked_milestone_id`. Leaving it blocked is why those slices do not close FR-TASK-004 (criterion 1, and the source-Finding half of the evidence on criterion 3).

2. **Status transitions.** Labels are prototype-only. Proposal for slice A, not a spec: persist `planning | in_progress | blocked | released`, default `planning`, authorized PATCH may move among them and audits the change. No extra states, no workflow builder. `blocked` is stored so the badge can render, and it gets no list tab. This proposal does not constrain status by child Tasks. See items 17 and 18.

3. **Per-task Gantt dates.** Task has `due_date` only (`15-data-contracts.md`, `schema/task.ts`). The Gantt needs a start and an end per bar, and the prototype's `TASK_SCHEDULES` is mock. Adding `task.start_date` would change the Task contract and is not part of FOP-TASK-004. Proposal: slice C draws each child from the Milestone `start_date` to the Task `due_date` (or a point on `due_date` when due is null) and records that deviation. Planned dashed bars are out. If product wants prototype-identical bars, that is a separate Task-contract decision.

4. **`reopened` in the progress buckets, and on the Gantt.** Prototype progress ignores it. `TASK_BAR_COLORS.reopened` in `screen-milestone-gantt.jsx` is warning-red (`--color-warning-red`), and the legend has no Reopened entry (Doing, Review, Done/Released, Todo/Backlog, Planned only). Proposal: count `reopened` as in flight, not as released and not as queued. Say so next to the formula. Slice C either adds a legend swatch when it draws that bar, or records that the color exists and the legend does not. Do not do neither.

5. **Owner default.** Prototype always shows an owner. The default-owner ladder does not mention Milestone. Who may be named owner is not open: §6 requires an actor in the workspace, elevated, with `finding.manage` on the Milestone's Managed System, on create and on PATCH. What is open is only the default when the client omits the field. Proposal: default the creating actor, who already passed that check. Do not bolt Milestone onto the four-step resolver without editing `03-api-contracts.md`. Adding Milestone to the scoped-create list is a stale-line fix (§8), not this item.

6. **Display-id prefix.** Not specified. Must be a new `next_display_id` arm. Not `M-`.

7. **Text length limits** for `title` and `why`. Not specified. Task title max is 200 on the convert body only. Do not silently reuse 200 for `why`.

8. **`selected` vs `param`.** Pre-existing route-contract drift. Follow `param`.

9. **Activity read model.** Confirmed absent. Not "confirm before building." `apps/backend/src/modules/core/audit/audit-service.ts` exports `createAuditService`, which returns only `record()`. No module and no route reads `audit_log`. There is no Milestone comment stream, and there should not be one (ADR-0049 progress notes are Finding and Task only). The Activity section needs a new read path in `core/audit` and its own permission story: who may read audit rows for a Milestone. That is not a free ride on slice A's write audit, and it is not in B1 or B2. B2 may ship the empty copy `활동 기록이 없습니다.` The feed waits.

10. **Create form layout.** The prototype has a button and no form. Fields are the detail properties. Do not design a different form. Ownership is not open: slice B2 draws `New milestone` and the editable detail properties. This item is only the layout, which is "use the detail properties," not a missing slice.

11. **Several Findings, one Milestone.** `linked_milestone_id` does not enforce uniqueness. The prototype shows zero or one source. Leave the column non-unique until the Finding slice is decided.

12. **Tasks-section columns: prototype vs spec.** `MilestoneTaskRow` (`screen-milestones.jsx`) starts with a `SeverityIndicator` driven by `task.priority`, then id, title, internal status, `estimate`, `updated`, and assignee. `06-task-project-system.md` (Milestone Detail → Tasks) says "status, assignee, priority, and due date". Prototype = priority + estimate + updated. Spec = priority + due date. `estimate` is not a field in `15-data-contracts.md` or `schema/task.ts`. Root `AGENTS.md`: prototype wins layout and copy, spec wins behavior. Needs a call before B2 builds the Tasks section: render due date where the prototype shows estimate, or drop that slot. Do not invent an `estimate` column to match the mock.

13. **Reporter-safe summary candidate.** `06-task-project-system.md` (Milestone Detail → Overview) names it. The prototype Properties block does not show it. The §6 table sketch has no column for it. Needs a decision: stored text, derived, or deferred. Do not add the column in slice A to paper over the gap.

14. **Manual evidence linking for standalone Milestones.** `01-domain-model.md`: a Milestone "may reference evidence when linked manually." That is not the Finding → Milestone workflow (item 1). Slices A–C leave evidence count and linked objects empty, so FR-TASK-004's detail criterion is not met on that half. Closing it needs a `milestone` entity-link type and a registered pair even when no Finding is involved. Do not widen `entity_links` inside A–C to paper over this, and do not treat the Evidence empty copy as the criterion.

17. **Can a Milestone be `released` with unreleased children?** Item 2 proposes a free PATCH among the four prototype statuses. Nothing in that proposal stops `released` at 0% progress, or the reverse (children released, Milestone still `planning`). Say whether status is free of child state or constrained by it before treating the free PATCH as the rule.

18. **Can a Task be assigned to an already-`released` Milestone?** The assign command in §6 checks existence, workspace, and Managed System. It does not look at Milestone status. Allowed, or rejected?

Review items that are not left open: Managed System immutability and owner eligibility are locked in §6 (a test that PATCH rejects `primary_managed_system_id`; `owner_actor_id` must be an in-workspace elevated actor with `finding.manage` on the Milestone's Managed System). The audit read path is item 9, now confirmed absent rather than unconfirmed. Which criteria A–C close is stated under Sub-scopes, not as an open question. Adding `tasks/repo` and `milestones/repo` to the module-seams guard is a slice A acceptance item.

## 8. Stale lines to fix with the implementation, not now

- `apps/backend/src/db/schema/task.ts` comment, once the FK exists.
- `docs/design/15-data-contracts.md` "no FK until Milestone domain lands", and add the `milestones` attributes that this note had to reconstruct.
- `docs/implementation/04-database-and-migrations.md` Milestone bullet only. Work Initiative stays future.
- `docs/implementation/api/tasks.md` convert validation, when the check exists.
- `docs/implementation/03-api-contracts.md` Scoped Create Requirements. The list is VOC, Finding, Task Request, Task, Survey. Milestone is a new Managed-System-scoped create and is not on it. Slice A adds Milestone. The create body field is `primary_managed_system_id` (the column). That is the value the contract means by `managed_system_id`. Do not add a second body field under the contract's name. The same file documents standalone `POST /tasks`, and `tasks/routes.ts` does not register that route. Do not send an implementer there for a template.
- `docs/implementation/api/dashboard.md` if anyone is tempted to turn `milestone-outcome` on. The right edit is to point at FOP-OUT-014, not to populate the metric.
- ADR-0027's "Milestone remains deferred" sentence becomes history when the table ships. It does not need a reversing ADR. The status enum, if locked, is a new decision and should be recorded where this repo records decisions, because no current ADR lists those four labels.

<!-- RESEARCH-6-DONE -->

## Revision (opus review addressed)

Independent review: `.review/RESEARCH-6-milestone-OPUS-REVIEW.md`. Claims that review checked and marked accurate are unchanged, including the Finding → Milestone stop-and-report. This section is the list of what the revision changed.

Corrected:

- Module seams. `FORBIDDEN_REPO_TARGETS` in `apps/backend/src/__tests__/module-seams.test.ts` is `findings/repo`, `findings/repo-read`, `entity-links/repo`, `task-requests/repo`. It does not include `tasks/repo`. The milestone boundary is not enforced today. Slice A adds `tasks/repo` and `milestones/repo` to that set.
- Cross-module reads. The seam is an exported function from the owning module's `index.ts` or `commands.ts` (`tasks/service.ts` imports `linkTaskToFinding` from `findings/commands.js`). The source-Finding reader and the child-task aggregate follow that shape. Not a constructed service dependency.
- Create field. `primary_managed_system_id` everywhere on the body and the table. List query stays `managed_system_id`, which is the existing filter name. `03-api-contracts.md` documents standalone `POST /tasks`; `tasks/routes.ts` does not register it. No implementer is pointed at that route.
- Undecided cross-references point at §7. §8 is only "Stale lines to fix", and it now includes the scoped-create list in `03-api-contracts.md`.
- ADR-0027 is quoted ("Milestone remains deferred…"). The reading that this means "until FR-TASK-004", not "Phase 1/2", is marked as this note's analysis.

Added:

- `MilestoneTaskRow` starts with a `SeverityIndicator` on `task.priority`. Tasks-section columns are §7 item 12: prototype is priority + estimate + updated, spec is priority + due date, and `estimate` has no data-contract field. Prototype wins layout, spec wins behavior; the call is open.
- `TASK_BAR_COLORS.reopened` is warning-red and has no legend entry (§7 item 4).
- "reporter-safe summary candidate" (`06-task-project-system.md` Overview) is §7 item 13. The prototype and the table sketch both omit it.
- Managed System of a Milestone is immutable. Slice A tests that PATCH rejects `primary_managed_system_id`.
- `owner_actor_id` must name an actor in the workspace who is elevated and has `finding.manage` on the Milestone's Managed System.
- The Activity audit read path is confirmed absent (`createAuditService` returns only `record()`). It needs its own read path and permission story. It is not in slice A or B.
- List-page child counts are one grouped query exported from the tasks module, not one permission-checked fetch per row.
- Create/edit UI (`New milestone`, editable detail properties) is slice B2. The old slice B is split into B1 (backend filter, assign, aggregate), B2 (list, detail, create/edit, visual harness), and optional B3 (convert picker and the Task detail row). B2's file list names `AppSidebar`, `vite.config`, and the mock API from the start. A Milestone nav count, if added, treats an absent key as absent, not zero.
- Slices A–C deliver FR-TASK-004 only in part. Criterion 1 (create from Finding) stays blocked. Evidence count and linked objects stay empty, because the only evidence path scoped here is a source Finding. The manual Milestone↔evidence link is §7 item 14 and needs its own `milestone` entity-link type.
- New undecided items 12, 13, 14, 17, and 18. Review items on immutability, owner eligibility, the audit read, completion accounting, and the module-seams guard are decided in the body, not left open.

<!-- RESEARCH-6-REVISED-DONE -->
