# Survey

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Survey

```text
POST /surveys
GET /surveys
GET /surveys/:id
PATCH /surveys/:id
POST /surveys/:id/questions
PATCH /surveys/:id/questions/:question_id
PATCH /surveys/:id/questions/reorder
DELETE /surveys/:id/questions/:question_id
POST /surveys/:id/open
POST /surveys/:id/close
GET /surveys/:id/form
POST /surveys/:id/responses
GET /surveys/:id/results
GET /surveys/:id/outcome-follow-up
POST /survey-responses/:id/evidence-excerpt-candidates
POST /survey-responses/:id/approved-excerpts
DELETE /survey-responses/:id/approved-excerpts/:approved_excerpt_id
POST /survey-responses/:id/create-finding
POST /survey-responses/:id/mark-no-follow-up
POST /survey-responses/:id/reopen-follow-up
POST /survey-findings/:id/request-task (not implemented)
POST /survey-findings/:id/link-task (not implemented)
# future: POST /survey-findings/:id/link-milestone
```

Current reachable Finding task paths are in the `/findings/:id` family.

`POST /surveys` requires `survey.manage`, an `Idempotency-Key`, and mutation
rate limiting. Its strict request body is `{ type: 'discovery' | 'validation' |
'outcome', title, description?, primary_managed_system_id, analytics_area_id?,
operator_actor_id?, responses_identity_protected }`. It returns `201` with the
Survey DTO: `{ id, workspace_id, display_id, type, status, title, description,
primary_managed_system_id, analytics_area_id, operator_actor_id,
responses_identity_protected, created_by, opened_at, closed_at, created_at,
updated_at }`.

`GET /surveys` accepts the optional query
`managed_system_id=<uuid>|all` and returns a permission-filtered array of the
same Survey DTO (without `questions`).

`PATCH /surveys/:id` requires `survey.manage`, an `Idempotency-Key`, and
mutation rate limiting. Its strict, non-empty partial body permits only
`type`, `title`, `description`, `primary_managed_system_id`,
`analytics_area_id`, `operator_actor_id`, and
`responses_identity_protected`; omitted fields retain their stored values.
It is draft-only; an open or closed Survey returns `422 validation.failed` with
`fields: [{ path: ['status'], code: 'not_draft' }]`. Missing or cross-workspace
Surveys return `404 not_found.record`. Changing `primary_managed_system_id`
checks `survey.manage` on both the current and target Managed System, so a
caller cannot move a Survey into an unauthorized scope. A successful update
returns `200` with the Survey DTO and writes `survey_updated` in the same
transaction; audit detail is `{ survey_id }` only.
Errors: `validation.failed`, `validation.malformed_idempotency_key`,
`permission.denied`, `not_found.record`, `conflict.parent_archived`,
`conflict.idempotency_key_reuse`, and `rate_limited.actor`.

The three question commands require `survey.manage`, an `Idempotency-Key`, and
mutation rate limiting; they are draft-only. They create, update, or delete a
question at the listed Survey/question IDs.

`PATCH /surveys/:id/questions/reorder` requires the same `survey.manage`,
Idempotency-Key, mutation-rate-limit, and draft guard. Its strict body is
`{ question_ids: uuid[] }`, containing every question ID for that Survey
exactly once. Missing, duplicate, or foreign IDs return `422 validation.failed`
without changing any order. The command locks the Survey and all of its
questions, then atomically assigns dense `sort_order` values `0..n-1` in body
order. It returns `200` with the Survey DTO including reordered questions and
writes `survey_questions_reordered` in the same transaction with audit detail
`{ survey_id }` only.
Errors: `validation.failed`, `validation.malformed_idempotency_key`,
`permission.denied`, `not_found.record`, `conflict.idempotency_key_reuse`, and
`rate_limited.actor`.

`POST /surveys/:id/open` and `POST /surveys/:id/close` require
`survey.manage`, an `Idempotency-Key`, and mutation rate limiting. Both return
`200` with the Survey DTO. Opening an already open Survey is an idempotent no-op
that returns its current DTO. Opening is otherwise valid only from `draft`, and
closing only from `open`; an invalid transition returns `422 validation.failed`
with `fields: [{ path: ['status'], code: 'invalid_transition' }]`. Opening with
zero questions returns `422 validation.failed` with
`fields: [{ path: ['questions'], code: 'required' }]`, then validates the
questions. A successful open/close updates the status and records respectively
`survey_opened` (with `survey_id`, `display_id`, `question_count`) or
`survey_closed` (with `survey_id`, `display_id`).

`GET /surveys/:id/form` is the respondent form read surface. Any authenticated
Actor in the same Workspace may read an open Survey without `survey.read`; a
missing or cross-Workspace Survey returns `404 not_found.record`, and a
non-open Survey returns `409 conflict.survey_not_open`. Its DTO is respondent
safe: form fields, questions, choices, and rating bounds only—never operator or
personal-response data.

`POST /surveys/:id/responses` is implemented for an authenticated Actor in the
same Workspace and requires `Idempotency-Key`. It returns `201` with only
`{ id, survey_id, submitted_at, identity_protected }`; it never echoes answers.
A missing or cross-Workspace Survey returns `404 not_found.record`; a non-open
Survey returns `409 conflict.survey_not_open`; a second submission returns
`409 conflict.survey_response_already_submitted`; and reusing a key with a
different payload returns `409 conflict.idempotency_key_reuse`. The `422
validation.failed` matrix covers malformed or duplicate question IDs, unknown
or inactive-branch answers, missing required answers, answer-kind/value and
choice mismatches, rating bounds, and trimmed text length.

### GET /surveys/:id/results — aggregate-only safe result summary

This read-only endpoint requires a session and matching workspace context. It first looks up the Survey by `(workspace_id, survey_id)`, then checks `survey.read` on the Survey's primary Managed System. A missing, cross-workspace, or denied Survey returns `404 not_found.record`; an explicit deny also returns 404 so the route does not disclose existence. Admin role may satisfy `survey.read` under the normal Survey authorization rule, but does not bypass the anonymity policy.

`survey.read_personal_responses` is a separate explicit capability. Its holder receives exact aggregate counts and approved result excerpts; result-excerpt items additionally carry `response_id` only behind this gate. Admin role alone never grants this capability. Open and closed Surveys return results; a draft Survey returns `409 conflict.survey_results_unavailable`.

The query schema is a strict empty object. Result filters are deferred because responses do not retain immutable cohort dimensions and overlapping filtered cohorts would permit subtraction attacks. Future filters require stored cohort snapshots plus an explicit privacy policy.

Every result includes `response_state: "none" | "below_threshold" | "visible"` and the resolved positive-integer `anonymity_threshold`. A total response count of zero returns `"none"` for every actor because no individual response can be inferred; non-holders still receive the existing suppressed question shape, while holders retain visible questions with zero answer counts. For a non-holder with one through `anonymity_threshold - 1` responses, the state is `"below_threshold"` and every question stays suppressed using `{ question_id, visibility: "suppressed", response_count: null, suppression: { code: "anonymity_threshold" } }`, without a numeric cohort count. A holder of `survey.read_personal_responses` receives `"visible"` for a nonzero cohort below the threshold; cohorts at or above the threshold are `"visible"` for every actor. The configured workspace threshold defaults to `5` when no workspace-settings row exists. At or above the threshold, a choice or rating question is also fully suppressed when any positive exposed option or collapsed rating-band count is below it. Text is suppressed when its positive answer count is below it. Zero-count buckets do not trigger low-bucket suppression.

Visible choice results contain configured option `key`, `label`, and count plus the question answer count. Visible rating results contain only deterministic `low`, `mid`, and `high` counts derived from the configured rating domain; raw values and averages are not returned. Visible text results contain only `answer_count`, `distribution: null`, and active approved `excerpts: [{ id, text }]`; holders of `survey.read_personal_responses` additionally receive excerpt `response_id`. Non-holders never receive that key. Question order follows the Survey configuration and `identity_protected` mirrors the Survey setting.

### GET /surveys/:id/outcome-follow-up — outcome follow-up read (ADR-0055 part C)

This read-only endpoint requires a session and matching workspace context and follows the results read path: the Survey is looked up by `(workspace_id, survey_id)`, then `survey.read` is checked on the Survey's primary Managed System. A missing, cross-workspace, or denied Survey returns `404 not_found.record`; a malformed `:id` returns `422 validation.failed`. A Survey whose type is not `outcome` returns `404 not_found.record`; a draft Survey returns `409 conflict.survey_results_unavailable`. The query schema is a strict empty object and the route takes no `Idempotency-Key`.

The response is the strict object `{ survey_id, classifiable, follow_up_needed, personal_access, items }`. `classifiable` is true when the Survey is closed and its total response count meets the workspace `survey_anonymity_threshold`; `follow_up_needed` is true when the Survey is classifiable and at least one poor response currently has resolution `open`. These two booleans are the only classification data an actor without `survey.read_personal_responses` receives — no numeric counts, no response ids, no per-response flags, so the payload cannot become a subtraction oracle. Admin role may satisfy `survey.read` but never grants personal access; `personal_access` mirrors an explicit `survey.read_personal_responses` grant on the Survey's primary Managed System.

`items` is `null` for a non-holder. For a holder it is an array ordered by `response_number`, containing exactly the poor responses at every resolution (the UI filters Open / 해소됨 / 후속 없음). Each item is `{ response_id, response_number, submitted_at, low_answers, resolution, finding, decision, next_actions }`: `response_number` is the 1-based ordinal by `(submitted_at, id)` over all responses of the Survey (displayed as "응답 #n"); `low_answers` lists only the low-band rating answers as `{ question_id, question_label, value, rating_min, rating_max }` — mid-band answers on the same response never appear; `resolution` is `open` | `finding` | `no_follow_up` with the ADR-0055 precedence (an active `generated_finding` link to a `draft`/`active`/`converted` Finding wins, then a current `no_follow_up` decision); `finding` is the qualifying Finding `{ id, display_id, status }` or null — it is returned only when the caller's Finding read scope (`finding.read`, elevated-role rule, Admin bypass) includes that Finding's own primary Managed System, otherwise `finding` is null while `resolution` still reports `finding`; `decision` is the current decision row `{ state: 'no_follow_up' | 'reopened', reason, updated_at }` or null.

`next_actions` per item: `create_finding` plus `mark_no_follow_up` when `resolution` is `open`; `reopen_follow_up` when `resolution` is `no_follow_up`; none when `resolution` is `finding`. Each action is `availability: 'allowed'` when the caller passes `finding.manage` (Admin role bypass intact) on the Survey's primary Managed System, otherwise `blocked_requestable` with `requestable_permission: { permission: 'finding.manage', managed_system_id }` when the capability is requestable, or null.

Items are personal data: the survey-grain booleans come from the aggregate-only definer `survey.read_outcome_follow_up_survey_state`, and item rows come from `survey.read_outcome_follow_up_items_personal` (migration 0053), called only after the personal gate. A holder read writes one `survey_response_personal_read` audit event per exposed `(response, low-answer question)` pair in the same transaction, with strict detail `{ survey_id, survey_response_id, question_id }`; a non-holder read writes none. No entity links are created and no dashboard queue state changes; the `bad-outcome-no-followup` count already follows ADR-0055.

Error codes: `validation.failed`, `not_found.record`, `conflict.survey_results_unavailable`, and `rate_limited.actor`.

### Survey response evidence approval

`POST /survey-responses/:id/evidence-excerpt-candidates` accepts `{ question_id }` and returns the one matching `{ question_id, question_label, raw_text }` candidate. `POST /survey-responses/:id/approved-excerpts` accepts `{ question_id, redacted_excerpt }` and creates an append-only approved excerpt, returning `{ approved_excerpt_id, question_id, redacted_excerpt }`. Both routes resolve the response through the Survey evidence definer, then require `survey.read` and explicit `survey.read_personal_responses`; missing response, cross-workspace response, denied source read, and denied personal read are all `404 not_found.record`. Admin never bypasses personal-response access. A fully authorized actor receives `409 conflict.survey_results_unavailable` for a draft Survey. Approval then requires `survey.manage`; only this post-readable failure is `403 permission.denied`. `DELETE /survey-responses/:id/approved-excerpts/:approved_excerpt_id` validates both path IDs, follows the same access order, and returns `{ approved_excerpt_id, question_id, redacted_excerpt }` after revoking the active row or reading back an already-revoked row; an approval belonging to another response is `422 validation.failed`.

Candidate reads write `survey_response_personal_read` in the same transaction; approvals write `survey_response_excerpt_approved` in the same transaction as the approval row; first revocations write `survey_response_excerpt_revoked` in the same transaction as the `revoked_at` update. Audit detail contains IDs only—never raw or redacted text. Duplicate approvals are intentional separate rows. Revoked approvals are omitted from results. Aggregate result `next_actions` exposes permission-filtered `create_finding`.

### POST /survey-responses/:id/create-finding

This source-shaped route accepts strict `{ severity, confidence?, analytics_area_id?, primary_managed_system_id?, approved_excerpt_ids: uuid[] }`, requires an `Idempotency-Key` UUIDv4, and delegates transaction, permission, Finding, link, audit, and idempotency ownership to the Finding command. It never accepts caller title, summary, or evidence text. The command resolves the response through the Survey evidence seam in this order: request validation; source plus `survey.read` and explicit `survey.read_personal_responses` (missing, foreign, denied-read, and denied-personal all return identical `404 not_found.record`); draft state (`409 conflict.survey_results_unavailable` only after complete source access); target Managed System; then `finding.manage` (`403 permission.denied` only after source access).

The Finding has database provenance `source_type='survey_response'` and stores the response UUID only internally. Its DTO omits `source_id`; backend-generated title and summary use only survey type/display ID, approved question label, and approved redacted excerpt. Active approved excerpts must belong to this response; revoked, foreign, or mismatched IDs return `422 validation.failed`. Duplicate `approved_excerpt_ids` also return `422 validation.failed`. Each excerpt becomes an evidence-highlight snapshot plus internal-only `(survey_response, finding, evidence_of)` link; the command also writes internal-only `(survey_response, finding, generated_finding)`, `finding_created_from_survey_response`, and normal entity-link/evidence audits atomically. An empty excerpt array is valid.

Same actor/key/body/source replays the original Finding with no duplicate side effects; changed reuse returns `409 conflict.idempotency_key_reuse`; a new key intentionally creates another Finding. Evidence reads of approved snapshots require only same workspace and `survey.read`, not personal-response permission. Their source projection is `Survey response` and `<survey_type> · <survey_display_id> · Identity protected`; it never returns response UUID, respondent identity, raw answer, or Survey title. Generic survey-response highlight attachment remains deferred.

Evidence-read projections never return response UUIDs, respondent identity, raw answer, or Survey title. Result-excerpt `response_id` is a distinct surface, returned only behind the `survey.read_personal_responses` gate. A holder result read whose payload includes `response_id` writes one `survey_response_personal_read` audit event per exposed response/question pair; a non-holder result read writes none. This GET route takes no `Idempotency-Key`. Error codes: `validation.failed`, `not_found.record`, `conflict.survey_results_unavailable`, `rate_limited.actor`.

### POST /survey-responses/:id/mark-no-follow-up and /reopen-follow-up — outcome follow-up decisions (ADR-0055)

Both commands record or reverse an outcome follow-up decision on one survey
response. They require a session and matching workspace context, a required
`Idempotency-Key` UUIDv4 header (missing → `422 validation.failed` with
`fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }]`;
malformed → `422 validation.malformed_idempotency_key`), mutation rate
limiting, and a strict body `{ reason }` that is non-empty after trimming and
at most 2000 characters (blank or over-long → `422 validation.failed`).

Authorization follows create-finding's order exactly. The command first
resolves the response through the Survey evidence seam: source existence,
workspace scope, `survey.read`, and explicit `survey.read_personal_responses`
all collapse missing, foreign, denied-read, and denied-personal into the same
`404 not_found.record`, and Admin role never bypasses the personal-response
gate. It then requires `finding.manage` on the survey's primary Managed
System; denial returns `403 permission.denied` (Admin role bypass intact).

Classification is evaluated inside the transaction through the
`SECURITY DEFINER` classifier `survey.read_outcome_follow_up_state`: a
response is classifiable as poor only when its survey has `type: 'outcome'`
and `status: 'closed'`, the survey's total response count meets the workspace
`survey_anonymity_threshold`, and at least one rating answer falls in the
`getRatingBandForValue` low band. The two commands have separate
preconditions. **Mark** requires the subject to be classifiable as poor and
its resolution to be `open`; a subject that is not poor, or whose gap is
already cleared by an active `generated_finding` link to a
`draft`/`active`/`converted` Finding or by a current `no_follow_up` decision,
rejects with `409 conflict.stale_write` carrying `detail.failure_code`
`action_no_longer_available` or `recovery_item_resolved` respectively.
**Reopen** requires only that the current decision row is `no_follow_up`; it
does not re-run the classifier, and any other row state (or no row) rejects
with `action_no_longer_available`. After a reopen the response re-enters the
`bad-outcome-no-followup` queue only if it is still poor and above the
threshold and no qualifying Finding link exists. Rejected commands write no
state row and no audit row.

`mark-no-follow-up` upserts the single current row in
`survey.outcome_follow_up_decisions` to `no_follow_up` with the trimmed
reason, the deciding actor, and the survey's primary Managed System, and
returns `200 { response_id, resolution: 'no_follow_up', updated_at }`.
`reopen-follow-up` is legal only on a current `no_follow_up` row; it sets
`reopened` and returns `200 { response_id, resolution: 'open', updated_at }`.
There is no `DELETE`: history lives in `core.audit_log`.

Audit events (same transaction, subject `survey_response`): mark writes
`survey_outcome_no_follow_up_marked` with strict detail
`{ survey_id, managed_system_id, reason }`; reopen writes
`survey_outcome_follow_up_reopened` with
`{ survey_id, managed_system_id, reason, previous_reason }`. Neither detail
ever contains answer values or respondent identity. Dashboard queues
affected: `bad-outcome-no-followup` (marked responses leave the count;
reopened responses re-enter it). Same actor/key/body replays the stored `200`
response with no second audit row; changed reuse returns `409
conflict.idempotency_key_reuse`. Entity links are neither created nor
detached by these commands.

Error codes: `validation.failed`, `validation.malformed_idempotency_key`,
`permission.denied`, `not_found.record`, `conflict.stale_write`,
`conflict.survey_results_unavailable` (draft survey, raised by the evidence
seam before the manage check), `conflict.idempotency_key_reuse`, and
`rate_limited.actor`.

## Forbidden Endpoint

```text
POST /survey-responses/:id/create-voc
```

If compatibility handling is ever needed, return `404` or `410`. Never create a VOC or `generated_voc` link from a Survey Response. Issue #185 pins the unregistered route to Fastify's `404` behavior with an integration test.
