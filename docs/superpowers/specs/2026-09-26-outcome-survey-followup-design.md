# RESEARCH-2 — Outcome Survey follow-up workflow

Read-only pre-issue research. No repo files other than this note were edited. No tests, builds, or dev servers were run. Nothing here is an implementation decision; the product questions in [Decisions required before an issue](#decisions-required-before-an-issue) are unresolved on purpose.

Date: 2026-09-26.

## Short answer

`type: 'outcome'` is a real survey type, and two later steps already exist: a Survey Response can create a Finding, and that Finding can request a Task. What does not exist is the behavior that makes the type mean something: classifying a result as poor, requiring that a follow-up workflow was configured, recording `mark_no_follow_up`, and clearing the dashboard gap only after Finding, Task Request, linked execution, or that explicit decision.

The design never defines "poor". It is not a score threshold, not a specific answer value, and not an explicit "reviewer marks it poor" rule. The only shipped classifier is a dashboard count that treats a rating answer equal to that question's `rating_min` as negative. That rule is not in the design docs, and it is not the same thing as the low/mid/high band the results screen already shows.

This follow-up decision does **not** have a hard dependency on Milestone. Automatic Milestone Released → Outcome Survey validation is explicitly future and out of MVP, and it does depend on a Milestone domain that is not built. A manually created Outcome Survey plus a follow-up decision can be scoped and shipped without it. Automatic creation of an Outcome Survey when a Task is released is also not specified as an endpoint and should not be folded into the first issue.

One constraint is easy to miss and is not a detail. `fops_app` has no `SELECT` on `survey.survey_responses` or `survey.survey_response_answers`. Every read goes through a `SECURITY DEFINER` function. The poor-result classifier cannot be a plain TypeScript function over rows. It has to be one or more new `SECURITY DEFINER` functions, and each one needs its own privilege decision about what it may return. A return value that includes a response id or a per-response poor flag crosses the same line issue #217 drew for the aggregate count. See [Response rows are not readable by the app role](#response-rows-are-not-readable-by-the-app-role).

## 1. Exact spec for the outcome → follow-up workflow

Source: `docs/design/07-survey-system.md`, read in full. The workflow is `WF-SURVEY-003: Outcome Survey`, not a differently named section.

Survey type definition:

```text
Outcome Survey:
- Task 또는 Milestone 완료 후 개선 효과 확인용
```

Workflow:

```text
### WF-SURVEY-003: Outcome Survey

Task / Milestone Released
→ optional Outcome Survey
→ Result Summary
→ optional Follow-up Finding / Task Request if result is poor and workflow is configured
```

Acceptance criterion inside `FR-SURVEY-005: Convert Result To Action` (priority SHOULD):

```text
- Outcome Survey with poor result can create follow-up Finding or Task Request.
- Survey can be used independently without converting results to Finding or Task.
```

The same FR also requires the ordinary, non-outcome path: result screen Create Finding and Request Task when the actor has permission and the workflow is enabled; no Create VOC; a Survey Response may become an Evidence Highlight or Finding evidence; a Survey Finding can create a Task Request or link execution work.

UI constraints on the same file (Survey Result):

```text
Survey Result is result summary-first. It is not an action queue surface, even
when follow-up actions are available.

Poor outcome follow-up is selected by backend-provided `next_actions`, not by
frontend heuristics. The screen may highlight a recommended action near the
result summary, but it must still start from result interpretation and must not
turn into a Dashboard-style recovery queue.

`mark_no_follow_up` may appear on a poor Outcome Survey detail or specific
follow-up gap detail when the actor is authorized. It must not appear as a bulk
or top-level action on the aggregate Survey Result overview.
```

And:

```text
When an Outcome Survey has poor results or configured follow-up, the most
important next action may be highlighted near the top, but the page still starts
from result interpretation.
```

Cross-system line in the same file:

```text
- Survey can validate Task or Milestone.
- Outcome Survey can reveal unresolved user experience after release.
```

Neighboring contracts say the same shape and add the resolution rule. They still do not define "poor" or "configured".

`docs/design/10-cross-system-workflows.md` optional integration pattern:

```text
→ optional Outcome Survey
→ optional Follow-up Finding / Task Request when configured
```

`WF-X-004: Milestone Outcome Validation` is explicitly not the MVP path:

```text
Future workflow, not MVP core:

Milestone Released
→ Outcome Survey
→ Outcome Result
→ If poor result: Finding / Task Request
→ If positive result: validate milestone outcome
```

`WF-X-005` lists "Bad Outcome Survey without configured follow-up" as a Home/Integration recovery item. `FR-X-003` says Survey Result offers Create Finding / Request Task.

`docs/design/08-dashboard-system.md` is where `mark_no_follow_up`'s meaning is specified, under Action Dashboard, not as a field name:

```text
- poor Outcome Survey with configured follow-up
```

is one of the expected-link sources. The example queue line is:

```text
- Outcome Survey 결과가 나쁜데 configured follow-up이 없는 항목
```

Resolution:

```text
Attaching Survey evidence to an existing VOC is context enrichment, not follow-up
completion. A poor Outcome Survey recovery item is resolved only by an allowed
follow-up decision such as Finding, Task Request, linked execution work, or an
explicit no-follow-up-needed decision.

No-follow-up-needed is an operational decision, not a passive absence of work.
It requires an authorized Admin or same Managed System Developer with the
relevant workflow capability, a required reason, and audit metadata. Reversing
the decision uses a separate reopen-follow-up action and re-evaluates recovery
items; the original decision history is not deleted.

Active Dashboard queues hide recovery items resolved by no-follow-up-needed.
Dashboard history and source object detail show that the gap was resolved by a
no-follow-up decision.
```

Same file, Milestone carve-out:

```text
Milestone progress is a Task Dashboard grouping in MVP. Milestone-to-Outcome-Survey gap detection is a future cross-system workflow, not an MVP action queue.
```

`docs/design/02-requirements-matrix.md` `FOP-OUT-014`:

```text
Automatic Milestone Outcome Survey validation in MVP | OUT | Manual Task/Milestone follow-up; outcome validation is future cross-system workflow
```

`docs/implementation/api/next-actions.md` adds the mechanism the frontend is forbidden to invent:

```text
Poor outcome recommendations must be returned as
API-provided priority or `recommended_action_id`, not inferred by the frontend
from score thresholds alone. Recommendation reasons must use domain-safe summary
text and must not expose hidden response detail.
```

And the no-follow-up action payload:

```text
No-follow-up-needed actions require Admin or same Managed System Developer
workflow capability, a non-empty reason, managed_system_id, source object,
previous recovery state, and affected recovery item ids. Reversal uses a
separate audited reopen-follow-up action that supersedes the decision and
triggers recovery item re-evaluation.
```

`docs/frontend/interaction-patterns.md` lists `mark_no_follow_up` as a Survey follow-up action id and repeats the placement rule: only on a poor Outcome Survey detail or a specific follow-up gap detail, never as a bulk or top-level action on the aggregate Survey Result overview.

`docs/design/12-ui-ux-principles.md` repeats: poor Outcome Survey or configured follow-up may highlight the next action near the top without replacing result interpretation.

### What counts as a poor result

**The design does not say.** Searched `docs/design/07-survey-system.md`, `08-dashboard-system.md`, `10-cross-system-workflows.md`, `12-ui-ux-principles.md`, `15-data-contracts.md`, and `docs/implementation/api/next-actions.md`. None of them give:

- a numeric threshold or comparison against `rating_min` / `rating_max`
- a named answer value (for example a choice key meaning "no")
- a survey-level rule (mean, majority low, any low response)
- a statement that a reviewer manually marks the result poor

`08-dashboard-system.md` Survey Dashboard lists "Low Score Response" and "Outcome Survey 결과" as separate bullets, still with no formula.

The design does say three related things, and they are constraints on whoever picks the formula later:

1. The frontend must not infer the recommendation from score thresholds. The backend returns `next_actions` and, when it recommends one, `recommended_action_id` or a priority (`next-actions.md`).
2. The gap is not "any outcome survey without a Finding". It is a **poor** result **and** a follow-up workflow that is **configured**. Dashboard must not treat every unlinked record as incomplete (`08-dashboard-system.md`, `10-cross-system-workflows.md`).
3. Evidence attachment to an existing VOC does not resolve the gap.

"Configured" is also undefined as data. `FOP-OUT-011` says MVP uses one shared workflow template, not per-Managed-System custom workflows. There is no survey column, workspace setting, or template row that means "this Outcome Survey expects a follow-up". `docs/design/15-data-contracts.md` Survey section lists `survey.surveys`, questions, responses, answers, and excerpt approvals only.

## 2. Does response scoring exist?

Rating capture and banded aggregates exist. An outcome score, a poor flag, and a follow-up decision do not.

What exists in `apps/backend/src/modules/surveys/`:

- Question kind `rating`, with `rating_min`, `rating_max`, `rating_low_label`, `rating_high_label` (`repo-read.ts`, `authoring.ts`, `routes.ts`). Authoring rejects a rating whose min is null, whose min is not strictly below max, whose min is below 0, or whose max is above 10 (`authoring.ts`).
- Submitted rating answers are integers inside that inclusive range (`authoring.ts` answer validation; `submit-response` integration test).
- `GET /surveys/:id/results` collapses rating answers into `low` / `mid` / `high` counts. It does not return raw values or an average (`docs/implementation/api/surveys.md`; `apps/backend/src/modules/surveys/results.ts`).
- The band split lives in `packages/shared/src/surveys/results.ts` `getRatingBandPartition` / `getRatingBandForValue`. Each band gets `floor(n / 3)` values, and the remainder goes to low, then mid. Documented example: 1–10 is low 1–4, mid 5–7, high 8–10. A 1–5 domain is therefore low 1–2, mid 3–4, high 5. This partition is a display bucket. Nothing calls it "poor".
- Anonymity suppression uses `survey_anonymity_threshold` (default 5). That is a privacy threshold, not an outcome threshold (`results.ts`, `07-survey-system.md`).

What does not exist:

- No survey-level score, NPS, mean, or `poor` / `negative` field on the result DTO (`packages/shared/src/surveys/results.ts` `surveyResultDtoSchema`: `survey_id`, `status`, `identity_protected`, `questions`, `next_actions` only).
- No `recommended_action_id`. The next-action union is only `create_finding` and `request_task`.
- The results service always emits `create_finding`. It emits `request_task` only when a Finding was already derived from an approved-excerpt response and the actor's elevated Finding read scope includes that Finding (`results.ts`). That is "a Finding already exists", not "this result is poor".
- The results UI agrees. `SurveyResultsSummary.tsx` comments that the aggregate DTO has no outcome score or poor-result flag, and it shows "Outcome follow-up is available" whenever `survey.type === 'outcome'` and `next_actions` is non-empty. Because `create_finding` is always present, that banner is "this is an outcome survey", not "this result is poor".

The one place a negative rule is executed is not in the surveys module. Migration `apps/backend/migrations/0046_dashboard_survey_gap_aggregate.sql` defines `survey.count_negative_outcome_without_followup`. It counts distinct **responses** on `type = 'outcome'` surveys where:

- the question and the answer are both `rating`
- `(answer_value #>> '{}')::numeric <= question.rating_min`
- there is no active `core.entity_links` row with `source_type = 'survey_response'`, `source_id = response id`, and `target_type IN ('finding', 'task')`

`apps/backend/src/modules/dashboard/repo.ts` calls that function. `dashboard/service.ts` publishes the count as queue `bad-outcome-no-followup`, severity `urgent`, next action route `/surveys`, intent `create_followup`. The migration comment says the count stays aggregate-only so answer text and response identity never cross that privilege boundary (issue #217).

That SQL rule is narrower than the results low band, and it is not the design's "poor". On a 1–5 rating, `rating_min` is 1, so only the answer `1` counts. The results low band for the same scale is `1–2`. A choice answer such as "did not improve" never counts. One floor-valued rating among several questions flags the whole response. Nothing in the function checks "workflow is configured", a Task Request link, a linked Task that is only reachable through the Finding, or a no-follow-up decision.

The `target_type = 'task'` branch cannot succeed through the current registry. `packages/shared/src/entity-links.ts` `registeredEntityLinkPairs` allows `survey_response → finding` as `generated_finding` or `evidence_of` only. There is no `survey_response → task` pair and no `survey_response → task_request` pair. A legal follow-up link from the response is a Finding. Task Request is `finding → task_request` (`requested_task`), which this function does not look at. ADR-0043 also writes `finding → task` (`requested_task`) and the `finding.linked_task_id` projection, both sourced at the Finding, so both are invisible to this function the same way. Creating the Finding already removes the response from the count, so the Task Request step is invisible to the queue. The function does not filter `surveys.status`, so responses on an `open` survey count. `surveys.status` is `draft`, `open`, or `closed` (`0036_survey_foundation.sql`).

### Response rows are not readable by the app role

This is a material design constraint for the classifier, the follow-up read, and the gap count. It is not a property of the dashboard function alone.

`0036_survey_foundation.sql` grants `survey.survey_responses` and `survey.survey_response_answers` to `fops_migrate` only. `0037_survey_response_submission.sql` grants `fops_app` `INSERT` on both tables and nothing else. There is no `SELECT` for the application role. Reads that exist today are `SECURITY DEFINER` functions with their own owner grants and their own return contracts:

- `0038_survey_result_aggregate.sql` — `read_result_aggregates`, `read_result_response_count` (counts and bands, not rows).
- `0039_survey_response_evidence_access.sql` — evidence readers, including approved excerpts.
- `0046_dashboard_survey_gap_aggregate.sql` — `count_negative_outcome_without_followup` returns one count. Column grants to `fops_survey_aggregate_owner` exclude answer text. Issue #217.
- `0047_survey_result_next_actions.sql` — `read_approved_result_excerpts_personal`.

`fops_app` can `SELECT` `survey.surveys` (`0036`). It cannot load a response or an answer in TypeScript and then classify it. "The surveys module owns classification" means the surveys module is the only caller. The classification itself runs inside one or more new `SECURITY DEFINER` functions. Each function's privilege decision is its return shape and who may `EXECUTE` it, not a check inside a query the app role cannot run:

- An aggregate function may return a count or a survey-grain flag. It must not return response ids, respondent ids, or exact scores. The gap count already follows this shape.
- A personal function may return response ids and per-response poor flags only for a caller the application has already authorized with `survey.read_personal_responses`. Do not pass a client-controlled "include identities" flag into the aggregate function. That would put the privilege decision in the wrong place.
- The function body sees every column its owner can read. The boundary is what it returns. ADR-0033 §G forbids a correlatable response id on a safe summary even when some other capability would allow a personal read elsewhere.

## 3. Can follow-up reuse the existing conversion endpoints?

Yes for the two writes the product already has. No new survey-specific entry point is required for "create the Finding" or "request the task from that Finding". A new entry point is required only for the decision the existing routes do not record.

### Survey Response → Finding — reuse

`POST /survey-responses/:id/create-finding` is implemented and is the normative creation path.

- Contract: `docs/implementation/api/surveys.md` and `docs/implementation/api/findings.md`. Finding is not created through `POST /findings`.
- Body: `{ severity, confidence?, analytics_area_id?, primary_managed_system_id?, approved_excerpt_ids: uuid[] }`. Caller title, summary, and evidence text are rejected. An empty excerpt array is valid.
- Authority: source access plus `survey.read` and explicit `survey.read_personal_responses` (missing, foreign, denied-read, and denied-personal all return `404`). Draft survey returns `409 conflict.survey_results_unavailable` only after that access check. Then `finding.manage` on the target Managed System (`403` only after source access). Admin does not bypass personal-response access. The permission matrix in `docs/design/09-permission-access.md` says "Read personal Survey responses" is "permission required" for Developer and **no** for Admin unless the explicit capability is granted.
- Side effects: provenance `source_type = 'survey_response'` stored internally and omitted from the DTO; internal-only links `(survey_response, finding, evidence_of)` per excerpt and `(survey_response, finding, generated_finding)`; audit `finding_created_from_survey_response`. Cross-system table: `docs/implementation/api/cross-system.md` row for this route, relation `generated_finding`, dashboard effect "resolves configured synthesis action for survey response".
- `count_negative_outcome_without_followup` does not treat `generated_finding` as the follow-up relation. Its `NOT EXISTS` matches any active `entity_links` row with `source_type = 'survey_response'` and `target_type IN ('finding', 'task')`. An active `evidence_of` link clears the count the same way `generated_finding` does. Today that is harmless. `entity-links/service.ts` drops every `survey_response` tuple from the generic `POST /entity-links` allowlist, and `POST /findings/:id/link-evidence` hard-codes `source: { type: 'voc' }`. The only writer is `createFindingFromSurveyResponse`, which inserts both relations. The predicate in [Gap count](#gap-count) narrows resolution to `generated_finding`. That narrowing is a behavior change relative to the shipped SQL, even though no current command can leave an `evidence_of`-only survey-response link.

Route ownership stays as it is: the surveys module parses the HTTP request; the findings command owns the transaction, the Finding row, the links, and the audit (`surveys/routes.ts` delegates to `findingsService.createFindingFromSurveyResponse`).

Friction for a rating-only poor result, not a reason to add a second create endpoint:

- The results UI disables Create Finding unless the actor can see approved excerpts (`SurveyResultsSummary.tsx`). A floor rating with no approved text excerpt cannot be acted on from that screen, even though the API accepts `approved_excerpt_ids: []`.
- Backend-generated Finding title and summary are specified to use survey type, display id, approved question label, and approved redacted excerpt (`surveys.md`). A rating-only follow-up has no excerpt. `docs/design/07-survey-system.md` already allows deterministic safe summaries from aggregate counts, configured labels, and score bands. The governing contract for that sentence is ADR-0033 §E–F, not only `07`: safe summaries are backend templates, and the allowlist is score band rather than an identifying exact score, plus approved labels and approved redacted excerpts. §G still forbids a correlatable response id. Using that for an empty-excerpt Finding is a copy rule on the existing command, not a new route. Do not invent the template until the poor-result rule exists.

### Finding → Task Request — reuse `POST /findings/:id/request-task`

Implemented contract in `docs/implementation/api/tasks.md`:

```text
POST /findings/:id/request-task
body: evidence_summary, requested_outcome (both required)
creates task_request.task_requests status pending_review
link (finding, task_request, requested_task)
audit task_request_created_from_finding
permission: finding.manage on the Finding's primary managed system
```

It does not approve, convert, or link an existing Task. Those stay on `POST /task-requests/:id/convert` and `POST /task-requests/:id/link-task`.

`docs/implementation/api/surveys.md` still lists:

```text
POST /survey-findings/:id/request-task (not implemented)
POST /survey-findings/:id/link-task (not implemented)
# future: POST /survey-findings/:id/link-milestone
```

and then says the reachable Finding task paths are the `/findings/:id` family. `docs/implementation/api/cross-system.md` still has a row for `POST /survey-findings/:id/request-task` with audit `task_request_created_from_survey_finding`. That row disagrees with `surveys.md`. Do not add the alias unless a later issue needs a distinct audit verb. The behavior already lives on `POST /findings/:id/request-task`.

`GET /surveys/:id/results` already returns `request_task` with `source_finding_id` after a Finding exists (`results.ts`, shared schema, issue prompt `.review/ISSUE-239-PROMPT.md`). `docs/implementation/api/next-actions.md` still says that action "is deferred to issue #239". That sentence is stale relative to `results.ts`. The results screen renders the button and does not wire it (`SurveyResultsSummary.tsx` returns a `Button` with no `onClick` for the non-`create_finding` action). Wiring that button is a small frontend gap on the existing action. It is not the outcome-poor workflow, and it still requires a Finding first, so it still does not fire for "rating is bad, no Finding yet".

### What cannot be reused

Nothing in those routes:

- decides that the result is poor
- checks that a follow-up workflow is configured
- writes a no-follow-up decision, a reason, or a reopen
- returns `mark_no_follow_up` or `recommended_action_id`
- creates an Outcome Survey because a Task or Milestone was released
- links a Task Request or a Task in a way the dashboard gap function can see without a Finding

A direct Survey Response → Task Request route would be new. It would also need a new entity-link tuple (`survey_response → task_request` does not exist) and a new dashboard predicate. The design's "Finding or Task Request" can be satisfied by the existing chain Response → Finding → Task Request. Whether a Task Request **without** a Finding must also resolve the gap is a product question, not something the current endpoints can do.

`mark_no_follow_up` should be its own command. It is not a conversion. Putting it on `create-finding` or `request-task` would mix "create work" with "record that no work is required".

## 4. What `mark_no_follow_up` is

It is a design-doc action id with no stored field, no route, and no handler.

Specified behavior, quoted above from `08-dashboard-system.md` and `next-actions.md`:

- Action id, also listed for VOC and for Survey (`interaction-patterns.md`, `next-actions.md` common VOC ids).
- For Survey, placement is a poor Outcome Survey detail or a specific gap detail. Not the aggregate results overview.
- Actor: Admin, or a Developer in the same Managed System, with "the relevant workflow capability". No capability key is named. `docs/implementation/05-permission-policy.md` and `packages` capability vocabulary were not extended with a follow-up decision capability. The closest existing keys are `survey.manage`, `survey.read`, `survey.read_personal_responses`, and `finding.manage`. None of those is specified as this action's gate. Do not pick one silently.
- Required: non-empty reason, `managed_system_id`, source object, previous recovery state, affected recovery item ids, audit metadata.
- Reversal is a separate reopen-follow-up action. History is not deleted. Active queues hide items resolved this way. History and the source detail still show the decision.
- Attaching survey evidence to a VOC does not count as this decision (`next-actions.md`).

Searched implementation for `mark_no_follow_up`, `markNoFollowUp`, `no_follow_up`, `noFollowUp`, `reopen-follow-up`, and `reopen_follow_up`. Hits are docs plus one frontend test that asserts the string is **absent** when survey results have no next actions (`SurveyResultsSummary.test.tsx`). No TypeScript or SQL writes a decision.

The VOC triage sketch in `interaction-patterns.md` ends in `finding_created | task_requested | public_update_written | no_follow_up`. That is a UX state list, not a column found in this research pass, and it is the VOC machine, not the survey machine.

Dashboard consequence today: a no-follow-up decision could not clear `bad-outcome-no-followup`, because the count only looks at entity links to `finding` or `task`. There is also no `recovery_item_id` in `apps/backend/src/modules/dashboard/`. The queue is a single count plus a jump to `/surveys` (`packages/shared/src/dashboard.ts` `DASHBOARD_OUTCOME_SURVEYS_ROUTE`). Home copy already names the queue "Bad Outcome Survey without follow-up" (`apps/frontend/src/lib/copy/home.ts`) and does not open a per-item decision panel.

`dashboard/service.ts` comment: "milestone-outcome has no MVP Milestone table or backing filter. Omit it." The summary test asserts `milestone-outcome` is absent. `HOME_COVERAGE_COPY` still has a label for that id. The label is unused by the API.

## 5. Milestone dependency

**The follow-up decision can ship without Milestone. Automatic milestone validation cannot, and it is specified as out of MVP anyway.**

Hard dependency, do not build it in this cluster:

| Claim | Where |
| --- | --- |
| Milestone is a lightweight Task-system grouping. Milestone-to-Outcome-Survey validation is a future cross-system workflow. | `docs/design/01-domain-model.md` §Milestone |
| `WF-X-004` Milestone Released → Outcome Survey → poor result → Finding / Task Request is "Future workflow, not MVP core". | `docs/design/10-cross-system-workflows.md` |
| Automatic Milestone Outcome Survey validation in MVP is OUT. The stated alternative is manual Task/Milestone follow-up. | `FOP-OUT-014` in `docs/design/02-requirements-matrix.md` |
| Milestone-to-Outcome-Survey gap detection is not an MVP action queue. | `docs/design/08-dashboard-system.md` |
| `task.tasks.milestone_id` and `finding.linked_milestone_id` are nullable uuids with no `REFERENCES` target. No migration creates a milestones table. | `apps/backend/migrations/0025_task_domain.sql`, `0020_finding_foundation.sql`; grep of `apps/backend/migrations` for `REFERENCES` milestone / `CREATE TABLE` milestones found nothing |
| Survey data contract has no task id and no milestone id. | `docs/design/15-data-contracts.md` Survey section |
| Finding-to-Milestone linking is not an MVP Finding endpoint. `POST /survey-findings/:id/link-milestone` is commented as future. | `docs/implementation/api/findings.md`, `docs/implementation/api/surveys.md` |

Not a Milestone dependency, but also not specified tightly enough to build as part of the first issue:

- `WF-SURVEY-003` starts at "Task / Milestone Released → optional Outcome Survey". "Optional" is doing a lot of work. There is no endpoint, column, or job that opens or attaches an Outcome Survey when a Task becomes `released`.
- The Task release workflow that **is** specified, `WF-X-003`, goes to reporter-facing status review and a public update, not to an Outcome Survey (`10-cross-system-workflows.md`). `docs/design/06-task-project-system.md` says VOC status may be updated after Released, not automatically on Done. It does not mention Outcome Survey.
- `FOP-OUT-014`'s replacement text is "Manual Task/Milestone follow-up". Read together with "optional Outcome Survey", the MVP-shaped path is: an operator creates an Outcome Survey by hand (the create API already accepts `type: 'outcome'`), collects responses, and then someone decides on follow-up. It is not "Task status flipped to released, so the system spawned a survey".

So:

- Scope the first issue to Outcome Surveys that already exist, whether or not they are tied to a Task.
- Do not block that issue on the Milestone research cluster.
- Do not silently add a Task-release trigger. That is a second product rule (which status, which respondents, which template, whether the survey is per Task or per release batch) and it is not written down.
- Leave Milestone Released → survey → "validate milestone outcome" in the future bucket with `WF-X-004` and `FOP-OUT-014`.

## Rough implementation design

Assumes the decisions in the next section are answered first. Where this sketch picks a shape, it is the shape that matches existing ownership, not a guess at the unanswered product rule.

### ADR constraints

The sketch cites these. They were not optional background.

- **ADR-0033** (Accepted). Safe summaries are deterministic allowlisted templates (§E–F). Forbidden fields include a correlatable response id and below-threshold counts (§G). The anonymity threshold applies after every effective filter. Pre-filter thresholding and rounded small buckets are rejected because they allow filter differencing and subtraction attacks (§D, Alternatives rejected). `survey.read_personal_responses` has no role bypass, including Admin (§C). This constrains whether a per-response poor list, or a per-Managed-System filtered count of poor responses, can exist. It also governs a rating-only Finding summary.
- **ADR-0035** and **ADR-0036** (both **Proposed**, not Accepted). External public-link responses would make `respondent_actor_id` nullable and add `external_respondent_id` plus `response_link_id`, with no stored Actor. ADR-0035 D5 keeps ADR-0033's protection contract. Per-response grain and "who can see the subject" have to survive actor-less responses if those ADRs are accepted. They are not current schema.
- **ADR-0043** (Accepted). Finding-to-Task conversion writes `finding.linked_task_id` as an operational projection next to the canonical `(finding, task, requested_task)` link. Neither substitutes for the other. "No convenience column" is the default, because cross-system history stays in `entity_links`. It is not a ban on every projection column. A column is justified only when an operational read needs it and the link remains the history.
- **ADR-0008** (Accepted). `core.audit_log` is immutable for `fops_app` (`INSERT` and `SELECT` only; `UPDATE` and `DELETE` revoked). Decision history can live there instead of in an append-only domain table. The business mutation and the audit row commit in one transaction.

### Ownership

- Surveys module owns the poor-result classification, the no-follow-up decision, and the reopen. Dashboard only reads a count. It must not store the decision (`08-dashboard-system.md`: Dashboard does not own source object lifecycle or workflow state transitions). Ownership here means the surveys module is the caller. The classifier is not TypeScript over response rows. See [Response rows are not readable by the app role](#response-rows-are-not-readable-by-the-app-role).
- Findings module keeps `createFindingFromSurveyResponse`. Task Requests module keeps `POST /findings/:id/request-task`.
- Entity links stay the record of "a Finding was created from this response". Do not add a convenience column on `survey.surveys` or `survey.survey_responses` for the linked Finding id unless an operational read needs a projection the way ADR-0043 needed `finding.linked_task_id`. The product invariant still holds: cross-system history is canonical through `entity_links`, and the projection does not replace the link. No such read need is established for this workflow.
- The no-follow-up decision is not an entity link. The registry has no relation for it, and the design asks for a reason, an actor, and history that survives reopen. A link row cannot hold that without overloading `relation_type`.

### Decision storage — two options, the record chooses

Proposed name, not locked: `survey.outcome_follow_up_decisions`.

Do not describe an append-only table as matching current convention. It does not.

- `survey.survey_response_excerpt_approvals` grants `fops_app` `INSERT`, `SELECT`, and `UPDATE ("revoked_at")` (`0039_survey_response_evidence_access.sql`). Revocation is an update of the approval row, not a superseding insert.
- `voc.voc_recommendation_decisions` grants `fops_app` `SELECT`, `INSERT`, and `UPDATE`, and no `DELETE` (`0044_voc_recommendation_decisions.sql`). The migration comment grants `UPDATE` so a dismissed pair can be promoted to `confirmed` in place. History of that transition is not a supersede chain on the decision table.

The precedent is a state row plus a column-scoped update, with history in the immutable audit log (ADR-0008). An append-only supersede chain is still defensible. It is a choice, not the house style. The ADR in the first issue picks one. The `SECURITY DEFINER` count function has to match the pick.

**(a) Append-only supersede chain.** One row per recorded decision. Reopen inserts a new row with `supersedes_decision_id`. Nothing updates or deletes the old row. Resolution is the latest row that no later row supersedes, and the count function evaluates that. Prefer this only if the product must query decision history inside the survey schema rather than from `core.audit_log`. Grants on this table would be `SELECT` and `INSERT` only. That grant shape matches `core.audit_log` (ADR-0008), not excerpt approvals.

**(b) State row plus audit log. Recommended.** One current row per subject. Mark and reopen update that row in place. Scope the `UPDATE` grant to the columns that actually transition, the way excerpt approvals scope `UPDATE` to `revoked_at`, if the transition is that narrow. The reason, actor, previous state, and reopen go to `core.audit_log` in the same transaction (ADR-0008). The count function reads the current row. This is simpler for the predicate and it matches `voc_recommendation_decisions`. The design sentence that history and the source detail still show the no-follow-up decision is satisfiable from the audit row plus the current state. It does not require the domain table to be append-only.

Columns worth having once grain is chosen. Option (a) uses `supersedes_decision_id`. Option (b) uses a current-decision column instead of that chain.

- `id`, `workspace_id`
- subject: `survey_id` and, if the decision is per response, `response_id`
- `decision`: at minimum `no_follow_up`. Do not also store `finding_created` here if the Finding link is already the record; storing both will drift. If product wants one timeline, the read model can union this table with `generated_finding` links rather than copying them.
- `reason` non-empty when `decision = no_follow_up`. Under (b), the current reason may live on the row and every prior reason lives in the audit `detail`. Under (a), each row keeps its own reason.
- `managed_system_id` (the survey's primary Managed System, checked, not trusted as a way to move scope)
- `decided_by_actor_id`, `created_at`. Under (b), also `updated_at` on transition.

No Milestone column. No Task column unless a later issue adds the release trigger. No `DELETE` for `fops_app` under either option.

### API sketch

All of these are sketches. They are not contracts until the poor-result rule and the grain are chosen. They should be written into `docs/implementation/api/surveys.md` in the same issue that implements them, not before the decision.

Read, new, not an overload of aggregate results:

```text
GET /surveys/:id/outcome-follow-up
```

Returns only for `type = 'outcome'`. Draft surveys stay `409 conflict.survey_results_unavailable`, same as results. Payload is a safe summary plus permission-filtered `next_actions`. It may include `recommended_action_id`. It must not include respondent identity, raw answers, or exact scores unless the actor has `survey.read_personal_responses` and the design's safe-summary rules still allow the field. `next-actions.md` says recommendation reasons use domain-safe summary text.

Suggested response shape, fields conditional on the grain decision. The handler calls a personal-grain `SECURITY DEFINER` function only after `survey.read_personal_responses` succeeds. Without that capability the payload is survey-grain only. Do not let the client choose the grain.

```text
{
  survey_id,
  poor: boolean,                    // survey-grain classification only, not a client threshold
                                    // still subject to decision 9 (anonymity threshold)
  configured_follow_up: boolean,    // see decision 2; do not hard-code true
  recommended_action_id: string | null,
  items: [                          // survey-grain: length 0 or 1, subject is the survey
    {
      subject_id,                   // CONDITIONAL. A response id is returned only when the
                                    // actor has survey.read_personal_responses. Without that
                                    // capability, subject_id is the survey id or the item is
                                    // omitted. This is the same privilege line issue #217
                                    // drew for the aggregate count: response identity does
                                    // not cross with the count.
      poor,                         // CONDITIONAL per-response flag. Same capability. Omit
                                    // the field entirely without survey.read_personal_responses.
                                    // Do not return false as a stand-in. A survey-grain poor
                                    // flag, if any, is the top-level field above, not this one.
      safe_summary,                 // ADR-0033 template: score band, no identity, no response id
      resolution: "open" | "finding" | "no_follow_up",
      next_actions: [ create_finding?, request_task?, mark_no_follow_up?, reopen_follow_up? ]
    }
  ]
}
```

`mark_no_follow_up` is on the item, not on `GET /surveys/:id/results`. The aggregate results route may later gain `recommended_action_id` so the existing page can highlight one action near the summary. It must not gain a bulk no-follow-up button (`07-survey-system.md`). It must not gain response-grain `subject_id` or a per-response poor flag for an actor who lacks `survey.read_personal_responses`.

Commands:

```text
POST /survey-responses/:id/mark-no-follow-up
  or, if grain is the survey:
POST /surveys/:id/mark-no-follow-up

body: { reason: non-empty string }
Idempotency-Key required
```

Reject when the subject is not an outcome survey, when the backend classifier says it is not poor, when follow-up is not configured, when a resolution is already in force, or when the actor fails the still-unspecified capability check. Return the structured action failure from `next-actions.md` (`action_no_longer_available`, `recovery_item_resolved`) rather than a generic error.

```text
POST /survey-responses/:id/reopen-follow-up
  or POST /surveys/:id/reopen-follow-up

body: { reason: non-empty string }
```

Inserts a superseding row. Does not delete the original. After reopen, the gap predicate counts the subject again.

Do not add `POST /survey-findings/:id/request-task`. After a Finding exists, the client calls `POST /findings/:id/request-task` as it does from Finding detail.

Create Finding stays `POST /survey-responses/:id/create-finding`. If the poor signal is rating-only, the existing command's generated summary needs a score-band sentence that does not require an excerpt. That is a change inside the findings command, still behind the current personal-response gate, unless decision 4 below moves that gate.

### Gap count

Change `survey.count_negative_outcome_without_followup` in the same migration as the decision table, after the ADR chooses the classifier, the grain, and storage option (a) or (b). Shipping the table without the predicate leaves the shipped count lying in between. Until that combined change, the shipped count keeps disagreeing with the design (floor rating, no "configured" check, no no-follow-up resolution, dead `task` target, no `status` filter). The function is `SECURITY DEFINER` owned by `fops_survey_aggregate_owner` and is deliberately not allowed to return answer text. A new version must keep that boundary: it may see rating values and decision ids, not free text or respondent ids. The classifier the predicate calls is itself one or more `SECURITY DEFINER` functions, not a TypeScript helper. The migration must be journaled in the same change, and the privilege review covers the table grants and every new function together.

A response (or survey) drops out of the count when any of these is true, matching `08-dashboard-system.md`, and not before:

- active `generated_finding` link from the response, or
- an active no-follow-up decision. Under (a) that means a row no later row supersedes. Under (b) that means the current state row. The predicate cannot be written until the ADR picks one.

Narrowing today's `target_type IN ('finding', 'task')` match to `relation_type = 'generated_finding'` is a behavior change. The shipped function treats an active `evidence_of` link as follow-up present. The migration comment should say so. Do not describe the new predicate as what the SQL already does.

The sketch follows link existence, not the linked Finding's later status. If that Finding is rejected, archived, or merged and the link stays active, the gap stays clear. Whether that is acceptable is decision 8. Do not bake link-existence in as if the design had already chosen it. Whether an `open` survey can be poor at all is decision 7. The shipped function counts those responses today.

Add Task Request or Task to that predicate only if product says they resolve the gap **without** a Finding. Today they cannot, because those links are not sourced at the response. ADR-0043's Finding-sourced Task link does not change that.

The queue id `bad-outcome-no-followup`, the route `/surveys`, and the home copy can stay. The route should eventually carry enough query state to open the follow-up review, not the unfiltered survey list. That is a frontend change after the read endpoint exists. Do not invent a recovery-item lifecycle inside dashboard; `08-dashboard-system.md` says Home, Dashboard, and Integration share resolution state and do not each own a copy. A single decision row in survey is that state. A stable id for the queue item can be the decision subject id, returned by the survey read, not a new dashboard table.

### Frontend surface

There is no "review this outcome and decide" screen.

- `/surveys/$surveyId` is the list plus survey detail (`ListShell`).
- `/surveys/$surveyId/results` is the aggregate summary (`SurveyResultsSummary`). Design forbids putting `mark_no_follow_up` here as a bulk or top-level action. Keep it summary-first. A later, smaller change may highlight `recommended_action_id` near the top of this page and link to the review surface. It must not become the queue.
- Dashboard and Home show one count and link to `/surveys`. There is no recovery detail panel in the dashboard module.

The review surface should be a Survey-owned detail, not a new shell and not an inlined survey inside Dashboard (`08-dashboard-system.md`: recovery clicks open a dashboard panel that shows reason, safe summaries, and jumps; it must not inline full Survey detail). Practical place: a follow-up section or route under the existing survey detail, opened from the dashboard queue, where each poor subject shows the safe summary, the current resolution, and the backend `next_actions`. `mark_no_follow_up` renders only when that payload includes it. Create Finding continues to the existing draft panel, aimed at one response. Request Task, once a Finding exists, continues to the existing `POST /findings/:id/request-task` flow. The results-page button that currently renders with no `onClick` (`SurveyResultsSummary.tsx`) is not part of that surface. It is an independent fix on an already-shipped action and does not wait on the poor-result ADR. See the standalone chore in the issue split.

Copy stays whatever the prototype already uses on the results screen. This research did not re-open `docs/design-prototype/` screen files; a UI issue must do that before layout or new strings (`Agents.md` prototype rule). Do not invent Korean or English labels for the decision buttons in the issue that only adds the API.

### Suggested issue split

Too big for one issue. Order matters because the classifier is a product decision, not a coding preference. The classifier is also not a pure function of rows the app role can read. Any issue that classifies calls new `SECURITY DEFINER` functions.

1. **Decision record, as an ADR.** Output is an ADR under `docs/adr/`, not only a `.review` note. A product decision that spans `07`, `08`, and `next-actions.md` is ADR-shaped (`AGENTS.md` Source Of Truth: an ADR supersedes those contracts on the decision it makes). The ADR answers the questions below, including storage option (a) or (b). No code. If the answers contradict `07` vs `08` vs `next-actions.md` and no existing ADR already picks a winner, stop and name which doc reopens. Do not pick a winner in the implementation issue. Decision 6 is a confirmation of docs that already lock the Milestone cut. It must not block this ADR.
2. **Decision storage, commands, and the gap predicate, in one change.** Table, mark-no-follow-up, reopen, audits, idempotency, the classifier functions, and the replacement `count_negative_outcome_without_followup`. One migration, one journal entry, one privilege review. Do not ship the table in an earlier issue. The old count would keep ignoring no-follow-up, and the queue would lie until the predicate landed. The new function stays aggregate-only. Adjust the dashboard integration test that seeds rating `1` on a 1–5 question (`summary.integration.test.ts` `seedSurveyGaps`) in this same change, because the predicate it asserts will move.
3. **Review read + results hint.** `GET` follow-up payload with `next_actions` / `recommended_action_id`. Response-grain `subject_id` and the per-response poor flag exist only behind `survey.read_personal_responses`. Optional highlight of `recommended_action_id` on the existing results page. Do not put `mark_no_follow_up` on the aggregate overview. Do not include the Request Task button wiring here.
4. **Review UI.** Survey-owned detail for one poor subject. Dashboard/Home queue deep-links to it. Prototype read is mandatory in that issue.
5. **Not in this cluster.** Task Released → create Outcome Survey. Milestone Released → Outcome Survey → validate milestone. `POST /survey-findings/:id/link-milestone`. Direct Survey Response → Task Request, unless decision 5 says the Finding step is optional.

**Standalone chore, not blocked on the ADR.** Wire the already-rendered Request Task button in `SurveyResultsSummary.tsx` to `POST /findings/:id/request-task` (it has no `onClick` today). In the same chore, fix the two doc rows that already disagree with that shipped action: `docs/implementation/api/next-actions.md` still says survey-result `request_task` is deferred to issue #239, and `docs/implementation/api/cross-system.md` still lists `POST /survey-findings/:id/request-task` as a live decision row while `surveys.md` says it is not implemented. Neither fix depends on the poor-result rule.

The merged storage-and-predicate issue is one backend change. It is not a pure TypeScript classifier over existing rows, and it must not be split so the count lies in between. The review-read issue stays separate while safe-summary copy and the personal-response gate are still moving. The chore above can ship before any of this.

## Decisions required before an issue

These are not answered by the design. An implementation issue that picks one is inventing product behavior.

1. **What is a poor result?** Options the current code could be mistaken for, none of which is specified:
   - Per rating answer, value `<= rating_min` (what the dashboard SQL does today; on 1–5 that is only `1`).
   - Per rating answer, the existing low band (`getRatingBandForValue`; on 1–5 that is `1–2`).
   - A survey-level aggregate (any low response, majority low, mean below a cutoff).
   - Reviewer judgment only, with no automatic poor flag.
   - A cutoff stored on the survey or on one designated outcome question.
   - Also: do choice questions count, or only `rating`? The SQL ignores choices. The design does not say "rating".
2. **What does "workflow is configured" mean?** Every `type = 'outcome'` survey, an explicit opt-in on the survey, or a workspace policy that does not exist yet? The dashboard design says a missing link is a gap only when a policy or workflow expects it. The SQL treats every floor rating as a gap. Those cannot both stay.
3. **Grain.** Per response (matches the SQL count and `create-finding`) or per survey (matches "poor Outcome Survey" as a single object)? `mark_no_follow_up` is forbidden on the aggregate overview and allowed on "a poor Outcome Survey detail or specific follow-up gap detail", which implies a subject smaller than the results page but does not say whether that subject is one response. ADR-0035 and ADR-0036 are Proposed, not Accepted. If they land, `respondent_actor_id` becomes nullable and a public response has no Actor. Per-response grain still has to name those rows (`external_respondent_id` / `response_link_id` are not a person), and "who can see the subject" cannot assume an Actor id. ADR-0033's protection contract does not move with them.
4. **Who can see the subject, and who can decide?** Create Finding requires explicit `survey.read_personal_responses`, which Admin does not get from role alone. ADR-0033 §C is the constraint, not only the permission matrix: that capability has no role bypass, including Admin. §G forbids a correlatable response id on a safe summary. The alternatives rejected in that ADR forbid recovering a protected segment by filtered counts or subtraction. The dashboard queue is an operational count that deliberately does not expose response identity (issue #217). A per-response review list, or a per-response poor flag, shown to the same people who see the count is that leak. The read shape in the API sketch keeps response-grain `subject_id` and the per-response poor flag behind `survey.read_personal_responses` for this reason. The decision capability is described as "Admin or same Managed System Developer with the relevant workflow capability" and the capability id is not in the matrix. Name the capability or map it to an existing one before coding the route.
5. **Must follow-up go through a Finding?** The built chain is Response → Finding → Task Request, and the link registry supports that chain only. The prose also lists Task Request and "linked execution work" as resolutions of the gap even when Finding is optional in MVP (`08-dashboard-system.md` says Finding is optional for high-severity VOC; it does not say the same sentence for Outcome Survey, but `FR-SURVEY-005` lists Finding and Task Request as alternatives). If Task Request without a Finding must resolve the gap, that is a new route and a new link tuple. If not, say so, and stop treating the SQL's `target_type = 'task'` branch as meaningful.
6. **Confirm the Milestone cut.** Recommended reading of the docs: do not wait for Milestone; do not build `WF-X-004`; do not auto-create the survey from Task `released` in the first issue. Confirm that "manual Outcome Survey, then a follow-up decision" is the intended MVP slice of `WF-SURVEY-003`. This is a confirmation of docs that already lock the cut (`FOP-OUT-014` OUT, `WF-X-004` "Future workflow, not MVP core"). It should not block the ADR or the standalone chore.
7. **Survey status gating.** Can a result be "poor", and can the gap count include it, while the survey is still `open` rather than `closed`? The shipped SQL says yes: `count_negative_outcome_without_followup` does not filter `surveys.status`, and status is `draft` / `open` / `closed`. A survey-grain rule almost certainly needs `closed`, because more responses can still arrive and the classification can change. This interacts with decisions 1 and 3. The mark-no-follow-up rejection rule "not poor" is unstable on an `open` survey if the answer is yes.
8. **What clears the gap after the Finding moves?** Link existence, or the linked Finding's current state? The shipped SQL and the sketch both clear on an active `generated_finding` link (the sketch's narrowing from "any finding link" is a separate behavior change, described under [Gap count](#gap-count)). If that Finding is later rejected, archived, or merged and the link stays `active`, the gap stays clear even though no follow-up survived. Neither the design docs nor the current function say which one is the resolution. Pick one before the predicate is written.
9. **Anonymity-threshold interaction.** If the classifier is survey-grain and aggregate, does a poor flag have to respect `survey_anonymity_threshold` the way result buckets do? A "poor" flag on a survey with fewer responses than the threshold (default 5, hard floor 5) can reveal the respondents' ratings the same way a small bucket can. ADR-0033 §D applies the threshold after every effective filter, and it rejects pre-filter thresholding and rounded small buckets because they allow filter differencing and subtraction attacks. A per-Managed-System filtered poor count has the same problem. This is a constraint on decisions 1, 3, and 4, not a display nicety.
10. **Storage and history model.** Option (a), an append-only supersede chain, or option (b), a state row plus `core.audit_log`, as written under [Decision storage](#decision-storage--two-options-the-record-chooses). This is an engineering choice rather than a product rule, and the recommendation is (b) because the predicate is simpler and it matches `voc_recommendation_decisions` plus ADR-0008. The ADR still has to choose. The count function cannot be written against both.

## Doc drift noticed, not fixed

The first two rows, together with the unwired Request Task button, are the standalone chore in the issue split. They are not blocked on the outcome-poor ADR. The last two rows are not part of that chore. The count predicate moves only in the combined storage issue. The unused `milestone-outcome` label is a separate leftover.

- `docs/implementation/api/next-actions.md` says survey-result `request_task` is deferred to issue #239. `apps/backend/src/modules/surveys/results.ts` emits it. `.review/ISSUE-239-PROMPT.md` is the contract that emission followed. The results button does not call the endpoint.
- `docs/implementation/api/surveys.md` says `POST /survey-findings/:id/request-task` is not implemented and points at `/findings/:id`. `docs/implementation/api/cross-system.md` still lists the survey-findings route as a decision row.
- `count_negative_outcome_without_followup` does not implement the design's configured-follow-up rule, the no-follow-up resolution, or a legal `survey_response → task` link.
- `apps/frontend/src/lib/copy/home.ts` still labels coverage id `milestone-outcome`, which the dashboard service omits.

<!-- RESEARCH-2-DONE -->

## Revision (opus review addressed)

Date: 2026-09-26. Revised in place against `.review/RESEARCH-2-outcome-survey-OPUS-REVIEW.md` (reviewer opus-5.5, source at `main` `af26ebb`). Claims that review marked correct are unchanged, including the migration 0046 predicate and its dead `task` branch, the entity-link registry, the result DTO, always-present `create_finding`, the unwired Request Task button, the band partition, the permission matrix, and the stale doc rows.

What changed:

1. **Storage convention.** Removed the claim that an append-only `SELECT`+`INSERT` table matches excerpt approvals. `survey_response_excerpt_approvals` grants `fops_app` `UPDATE ("revoked_at")`. `voc.voc_recommendation_decisions` grants `SELECT`, `INSERT`, and `UPDATE`. Stated option (a) append-only supersede chain and option (b) state row plus audit log. Recommended (b) as simpler and closer to that precedent. The ADR chooses.
2. **App-role read boundary.** Added a short-answer callout and [Response rows are not readable by the app role](#response-rows-are-not-readable-by-the-app-role). `fops_app` has no `SELECT` on `survey.survey_responses` or `survey.survey_response_answers` (`0036` migrate-only, `0037` `INSERT` only). Every current read is a `SECURITY DEFINER` function (`0038`, `0039`, `0046`, `0047`). The classifier cannot be a TypeScript function over rows. New definer functions need their own return-privilege decision. Removed the "pure function of data that already exists" issue-slice sentence.
3. **ADRs cited.** ADR-0033 (safe summary, no Admin bypass, anti-differencing) on visibility, anonymity, and rating-only Finding copy. ADR-0035 and ADR-0036 (both Proposed; nullable `respondent_actor_id`) on grain. ADR-0043 (`finding.linked_task_id` projection beside the canonical link, and the Finding-sourced Task link the gap SQL cannot see) on the convenience-column rule, which is no longer stated as absolute. ADR-0008 (immutable audit log) as the history home for option (b).
4. **`generated_finding` vs the shipped predicate.** The SQL accepts any active `finding` or `task` target, including `evidence_of`. Noted why that is harmless today (command-only survey-response tuples; `link-evidence` is VOC-only). The proposed `generated_finding` narrowing is called a behavior change, not a description of the current function.
5. **Issue split.** Old issues 2 and 3 are one issue: decision table, commands, classifier functions, and the gap predicate, one journal entry, so the count cannot lie in between.
6. **Request Task button.** Removed from the review-read issue. Paired with the `next-actions.md` #239 sentence and the `cross-system.md` `/survey-findings/:id/request-task` row as a standalone chore that can ship now.
7. **Decision-record output.** Issue 1 produces an ADR, not only a `.review` note. Decision 6 is marked as a confirmation that must not block that ADR or the chore.
8. **Decisions added.** (7) survey status gating — poor while `open`, which the shipped SQL allows. (8) gap resolution follows link existence or the linked Finding's current state. (9) anonymity-threshold interaction under ADR-0033. (10) storage option (a) or (b), so the count function has one shape to implement.
9. **API sketch.** Response-grain `subject_id` and the per-response poor flag are marked conditional on `survey.read_personal_responses`. Without that capability the payload stays survey-grain. Same privilege line as issue #217.

<!-- RESEARCH-2-REVISED-DONE -->
