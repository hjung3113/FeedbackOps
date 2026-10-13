# Survey

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Survey

```text
POST /surveys
GET /surveys
GET /surveys/templates
GET /surveys/copy-sources
GET /surveys/:id/copy-source
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
GET /me/survey-responses
GET /me/answerable-surveys
GET /surveys/:id/results
GET /surveys/:id/outcome-follow-up
POST /survey-responses/:id/evidence-excerpt-candidates
POST /survey-responses/:id/approved-excerpts
DELETE /survey-responses/:id/approved-excerpts/:approved_excerpt_id
POST /survey-responses/:id/create-finding
POST /survey-responses/:id/mark-no-follow-up
POST /survey-responses/:id/reopen-follow-up
```

`GET /me/survey-responses` exists for the external analytics platform (#548); it
is not a FeedbackOps screen surface.

Current reachable Finding task paths are in the `/findings/:id` family.

`POST /surveys` requires `survey.manage`, an `Idempotency-Key`, and mutation
rate limiting. Its strict request body is `{ type: 'discovery' | 'validation' |
'outcome', title, description?, primary_managed_system_id, analytics_area_id?,
operator_actor_id?, responses_identity_protected, starting_point? }`. It returns `201` with the
Survey DTO: `{ id, workspace_id, display_id, type, status, title, description,
primary_managed_system_id, analytics_area_id, operator_actor_id,
responses_identity_protected, created_by, opened_at, closed_at, created_at,
updated_at }`.

### Built-in starting-point creation (#1073, ADR-0070)

Requirement: FR-SURVEY-001. Session and matching Workspace guards remain in
force. `starting_point` is optional and strict:
`{ kind: 'builtin', template_id: nonempty string, version: positive integer }`.
The shared `surveyStartingPointSchema` also accepts the delivered existing-source
arm described below (#1074). Unknown template/version and source type mismatch
return `422 validation.failed` (field path `starting_point` or `type`, code
`invalid`). Raw question bodies and unknown fields at either body level are
rejected by strict parsing. Omission keeps today's blank creation and audit unchanged.

Keep all existing required fields, including explicit Managed System and
privacy. A missing/foreign-workspace system returns `404 not_found.record`, an
archived system `409 conflict.parent_archived`, and missing manage capability
`403 permission.denied`, including an explicit Admin deny. Optional Analytics
Area must be active and belong to the selected system; otherwise
`422 validation.failed` with `fields: [{ path: ['analytics_area_id'], code:
'out_of_scope' }]`. Operator resolution remains explicit → Managed System
default → creator, with workspace membership and `survey.manage` validated.
Title and description come only from the current request; catalog title and
description are preview suggestions/guidance, never silent persisted defaults.

On an idempotency miss, create one draft and the complete server-owned question
graph inside the existing transaction. Each inserted question receives a fresh
DB-generated UUID; dense `sort_order` and the full graph are validated before
success. There are no branch questions in version 1. Write one
`survey_question_created` structural audit per question and `survey_created`
with optional `{ starting_point: { kind, template_id, version }, question_count }`
in addition to its existing detail. The registered strict shared audit schema
permits these metadata fields and rejects prompt/label/title/answer content.
No Entity Link or response, approval, result, follow-up, Finding or distribution
state is created/copied. The draft has current creator/operator, fresh times,
null opened/closed times and independently chosen privacy/system/area.

A failure in any question insertion, complete-graph validation or audit rolls
back the Survey, questions, audits, Display ID counter and idempotency success.
The compact `201` Survey DTO above stays unchanged, without `questions`; read
persisted detail when entering the builder. UUIDv4 Idempotency-Key is required.
Same Actor/key/body returns the same graph/metadata and one audit set; changed
body/template/version with the same key returns
`409 conflict.idempotency_key_reuse`. Do not reread/recreate on completed replay.

### GET /surveys/templates — built-in preview catalog

Requirement: FR-SURVEY-001. This route uses session and matching Workspace
guards, the read rate tier, and `Cache-Control: private, no-cache`. Strict query
`{ managed_system_id: uuid }` is required: omission, invalid UUID, `all`, repeated
values and unknown keys return `422 validation.failed`. Validate same-Workspace
active system and `survey.manage`, preserving Admin explicit-deny precedence;
system/access failures use the same 404/409/403 codes as creation. This read
writes no product objects or audits and grants no personal-response access.

Response `200` is exactly `{ items: SurveyTemplate[] }`, parsed by exported
`surveyTemplatesResponseSchema` in `packages/shared/src/surveys/templates.ts`.
Items appear in Discovery, Validation, Outcome order. No pagination is needed
for this three-item server-owned catalog. Each item has:

| Field | Contract |
| --- | --- |
| `template_id` | `discovery-basic` / `validation-basic` / `outcome-basic`; immutable identity |
| `version` | positive integer, currently 1; changing definition content requires a new version |
| `type` | `discovery` / `validation` / `outcome` matching the built-in |
| `title` | preview title suggestion: `Discovery 기본 템플릿`, `Validation 기본 템플릿`, `Outcome 기본 템플릿` |
| `description` | preview guidance: `Managed System 사용 현황과 불편을 확인하세요.`, `제안된 개선 내용을 Survey 설명에 입력하세요.`, `출시된 개선 내용을 Survey 설명에 입력하세요.` respectively |
| `questions` | nonempty array in visible order; no Survey/question UUIDs |

Each strict question contains `key` (nonempty symbolic string), `kind`, `prompt`
(nonempty), `is_required` (boolean), `sort_order` (dense integers from 0).
`single_choice`/`multiple_choice` add `options: [{ key, label }]` (2–50
nonempty-key/label choices, in visible order). `rating` adds integer
`rating_min`/`rating_max` (0–10, min below max) and nonempty
`rating_low_label`/`rating_high_label`. `text` has no extra fields. Fields for
other kinds are absent, not null. Version 1 has no branches; preview keys never
stand in for persisted UUIDs. The exact definitions below are the server-owned
content contract, independent of the current Actor's target Survey fields.

### Built-in definitions (version 1)

| ID/type | Visible questions |
| --- | --- |
| `discovery-basic` / `discovery` | 0: `usage-frequency`, required `single_choice`: “이 Managed System을 얼마나 자주 사용하나요?” Options in order: `daily` “매일”, `weekly` “매주”, `monthly-or-less` “월 1회 이하”, `never` “사용한 적 없음”. 1: `pain-point`, optional `text`: “업무에서 가장 불편한 점은 무엇인가요?” |
| `validation-basic` / `validation` | 0: `expected-usefulness`, required `rating`: “제안된 개선이 업무에 얼마나 도움이 될 것으로 예상하나요?” 1–5, low label “전혀 도움이 되지 않음”, high label “매우 도움이 됨”. 1: `improvement-feedback`, optional `text`: “개선안에서 보완할 점은 무엇인가요?” |
| `outcome-basic` / `outcome` | 0: `released-usefulness`, required `rating`: “개선 후 이 Managed System이 업무에 얼마나 도움이 되나요?” 1–5, low label “전혀 도움이 되지 않음”, high label “매우 도움이 됨”. 1: `remaining-pain-point`, optional `text`: “개선 후에도 남아 있는 불편은 무엇인가요?” |

Validation's proposal context and Outcome's released improvement belong in the
operator's independently entered Survey description. Outcome remains positively
oriented (1–2 poor low band, ADR-0055); this starter makes no automatic
before/after causality or Task-completion claim.

#1073 supplies built-in creation and #1074 supplies existing-definition reuse.
The creation dialog (#1075) consumes these parsed reads and creates with a retained
Idempotency-Key for unchanged uncertain attempts. Creation errors never fall back
to blank creation; the builder loads persisted questions from GET detail. Source/read/token/snapshot/retry decisions are in
[ADR-0070](../../adr/0070-survey-starting-templates-and-definition-reuse.md).

### Existing Survey starting-point creation (#1074, ADR-0070)

The additional strict request arm is exactly
`{ kind: 'existing_survey', survey_id: uuid, definition_token: nonempty string }`
(token maximum 256 characters). Source means the saved definition, never unsaved
builder edits. All ordinary target validation above still applies, including
archived target system → `409 conflict.parent_archived`.

On the idempotency miss path, lock the source Survey before the target Managed
System (matching source authoring lock order), and lock its ordered questions.
Recheck current source read/manage and eligibility before comparing the token:

| Source condition | Error |
| --- | --- |
| Missing, foreign Workspace, unreadable, or read revoked | `404 not_found.record` |
| Readable but no manage, including manage revoked | `403 permission.denied` |
| Authorized system/type mismatch, empty/invalid definition | `422 validation.failed` |
| Authorized, eligible definition differs from preview token | `409 conflict.stale_write` |

Eligible sources are same Workspace, same selected active Primary Managed
System, saved draft/open/closed, with a nonempty valid complete graph and dense
visible order. Explicit denies override Admin fallback. Personal-response read
permission is neither required nor granted.

The token covers type, Primary Managed System, ordered persisted question IDs,
and every copied question field. Survey `updated_at` alone is insufficient.
Create an independent draft through the same atomic graph command as built-ins:
fresh Survey/Display ID and question UUIDs, parents inserted before children,
branch parents remapped to new IDs, option/trigger keys retained, and dense
visible order preserved even when a child visually precedes its parent.
Copy no responses, answers, excerpts/approvals, results, follow-up decisions,
Entity Links, Findings or distribution state. Title, description, privacy,
Analytics Area, creator and operator use the current request/resolution only.

Audit exactly `{ starting_point: { kind: 'existing_survey', survey_id },
question_count }` in `survey_created`, plus one structural
`survey_question_created` per copied question (including the new branch parent
ID when present). Audit provenance is a separate strict allowlist from the
request: never record the definition token or definition content. Any insertion,
validation or audit failure rolls back target/questions/audits/counter/idempotency
success together. The compact `201` response is unchanged. Same Actor/key/body
replays the completed graph without rechecking a subsequently changed/revoked
source; changed body/source/token with that key conflicts.

### GET /surveys/copy-sources — eligible saved-source metadata

Session and matching Workspace guards, read rate tier, and
`Cache-Control: private, no-cache` apply. Strict query:
`{ managed_system_id: uuid, q?: string, limit?: integer, cursor?: string }`.
The system is required and must be active in the current Workspace. Missing or
foreign system → 404, archived system → 409 `conflict.parent_archived`.
Require current `survey.read` (denial → 404) and `survey.manage` (denial → 403),
including explicit Admin denies. Unknown/repeated keys, invalid system/cursor,
or limits outside 1–50 return `422 validation.failed`. `q` is trimmed, at most
200 characters, and performs case-insensitive literal substring search over
title and Display ID (wildcards are escaped). Default limit is 20, maximum 50.

Response `200`, exported `surveyCopySourcesResponseSchema`, is exactly:
`{ items: [{ survey_id, display_id, title, type, status, question_count }],
page: { has_more: boolean, cursor?: string } }`. No other metadata is returned.
Only eligible nonempty valid saved definitions appear. Newest first, ordered by
`(created_at DESC, id DESC)`. The cursor is standard base64-encoded strict JSON
`{ created_at: ISO timestamp, id: uuid }`, preserving PostgreSQL microseconds;
the next page is strictly below that tuple. It represents the last emitted item
and is present only when another page exists. Fetch at most `limit + 1` metadata
rows, emit at most `limit`. No response/answer/VOC/Task joins or definition arrays
are loaded by discovery; SQL checks definition validity and computes counts.
This is live cursor pagination, not a frozen catalog across requests.

### GET /surveys/:id/copy-source — selected definition snapshot

Same guards, read tier and private/no-cache header. Path ID must be a UUID;
query is strictly empty (unknown parameters → 422). In a short repeatable-read
transaction, read same-Workspace source metadata and saved questions from one
snapshot, require current read/manage, active source system and a nonempty valid
definition. Missing/foreign/unreadable → 404, readable without manage → 403,
archived system → 409, empty/invalid definition → 422.

Response `200`, exported `surveyCopySourceResponseSchema`, is exactly
`{ survey_id, display_id, title, type, definition_token, questions }`.
Each ordered question is a strict allowlist:

| Field | Contract |
| --- | --- |
| `id` | persisted question UUID; never a symbolic built-in key |
| `kind` | `single_choice`, `multiple_choice`, `rating`, `text` |
| `prompt`, `is_required`, `sort_order` | saved nonempty prompt, boolean, dense visible integer order from 0 |
| `options` | choice array of 2–50 strict `{ key, label }` entries with nonempty unique keys/labels; null for other kinds |
| `rating_min`, `rating_max` | integers 0–10, min below max for rating; null for other kinds |
| `rating_low_label`, `rating_high_label` | saved nullable strings for rating; null for other kinds |
| `branch_depth` | 0 or 1 |
| `branch_parent_question_id` | persisted top-level single-choice parent UUID for a child; null otherwise |
| `branch_trigger_option_key` | existing parent option key for a child; null otherwise |

No Workspace/system/operator/creator/privacy/area/lifecycle/runtime fields or
question timestamps/survey ID/parent-depth storage fields are returned. The
source type is informational until the create request explicitly matches it;
the frontend must use these dedicated schemas, not the symbolic built-in preview
schema. #1075's creation dialog consumes this private snapshot for its read-only preview.

### Existing Survey list and mutation commands

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

### GET /me/survey-responses — the session Actor's own response history

This read-only endpoint requires a session and matching workspace context and
uses the Survey read rate-limit tier. It has no `survey.read` capability check:
the SQL projection filters on both `workspace_id = session.workspace_id` and
`respondent_actor_id = session.actor_id`, so it returns only rows submitted by
the caller. Unknown query keys are rejected. The strict query is
`{ limit?: integer 1..100, cursor?: opaque string }`; `limit` defaults to `50`.
An invalid cursor returns `422 validation.failed` with
`fields: [{ path: ['cursor'], code: 'invalid_cursor' }]`. The response sets
`cache-control: private, no-cache`.

Items are ordered by `submitted_at DESC, survey_id DESC`. The opaque cursor
contains the last returned `(submitted_at, survey_id)` pair, so equal
submission timestamps remain ordered without gaps. The strict response shape
is `{ items: [{ survey_id, survey_title, submitted_at, identity_protected }],
page: { has_more, cursor? } }`; `page.cursor` is present only when `has_more`
is true. The list includes responses for Surveys in any status (currently open
or closed; a response cannot exist for a draft).

The respondent can see their own row even when `identity_protected` is true;
that flag is returned as `true` and does not reveal the respondent to another
reader. This route returns no answers, operator data, other respondents, or
counts. Self-history reads write no audit events because the reader is the
data subject. An Actor with no responses receives
`200 { items: [], page: { has_more: false } }`, which confirms zero responses.
Errors: `validation.failed`, `auth.session_invalid`, and `rate_limited.actor`.

### GET /me/answerable-surveys — open Surveys the session Actor has not answered

This read-only endpoint requires a session and matching workspace context and
uses the Survey read rate-limit tier. It has no `survey.read` capability check,
matching `GET /surveys/:id/form`: any authenticated Actor in the same Workspace
may discover open Surveys they can answer. The SQL projection
`survey.read_my_answerable_surveys` filters on
`workspace_id = session.workspace_id`, `status = 'open'`, and the absence of a
`survey_responses` row for `session.actor_id`, so it returns only open,
same-Workspace Surveys the caller has not yet answered. Unknown query keys are
rejected. The strict query is `{ limit?: integer 1..100, cursor?: opaque
string }`; `limit` defaults to `50`. An invalid cursor returns `422
validation.failed` with `fields: [{ path: ['cursor'], code: 'invalid_cursor'
}]`. The response sets `cache-control: private, no-cache`.

Items are ordered by `opened_at DESC, survey_id DESC`. The opaque cursor
contains the last returned `(opened_at, survey_id)` pair, so equal open
timestamps remain ordered without gaps. The strict response shape is
`{ items: [{ survey_id, display_id, title, type, question_count, opened_at }],
page: { has_more, cursor? } }`; `page.cursor` is present only when `has_more`
is true. `question_count` counts the Survey's question rows, the same count the
`survey_opened` audit event records. This route returns no respondent data,
answers, operator fields, or other actors' state; a Survey leaves the list for
an Actor once they submit a response and re-enters never (responses are
immutable). An Actor with no answerable Surveys receives
`200 { items: [], page: { has_more: false } }`. Errors: `validation.failed`,
`auth.session_invalid`, and `rate_limited.actor`.

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

The Finding has database provenance `source_type='survey_response'` and stores the response UUID only internally. Its DTO omits `source_id`. After ADR-0064/#739 cutover the public `source_id` is
NULL and the original response UUID is retained in a Survey-owned protected
extension (proposed/new); generated title/summary contain deterministic Survey
type/display ID and approved question metadata only, never excerpt text. Active approved excerpts must belong to this response; revoked, foreign, or mismatched IDs return `422 validation.failed`. Duplicate `approved_excerpt_ids` also return `422 validation.failed`. Each excerpt becomes an evidence-highlight snapshot plus internal-only `(survey_response, finding, evidence_of)` link; the command also writes internal-only `(survey_response, finding, generated_finding)`, `finding_created_from_survey_response`, and normal entity-link/evidence audits atomically. An empty excerpt array is valid.

Same actor/key/body/source replays the original Finding with no duplicate side effects
(subject to ADR-0015/ADR-0064 targeted legacy Survey cache sanitization); changed reuse returns `409 conflict.idempotency_key_reuse`; a new key intentionally creates another Finding. Evidence reads of approved snapshots require only same workspace and `survey.read`, not personal-response permission. Their source projection is `Survey response` and `<survey_type> · <survey_display_id> · Identity protected`; it never returns response UUID, respondent identity, raw answer, or Survey title. Generic raw survey-response highlight attachment remains rejected. ADR-0064
accepts the separate proposed/new approval-selection command documented in
`findings.md`, implemented in #816 after #739/#740.

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

## Close-out responsibility (ADR-0067; implementation pending)

Survey operator resolution/validation is unchanged. Survey-response-derived Finding
creation gains permitted proposed/new owner Actor/team input and safe default-resolution
metadata through the Finding command, using the destination system and its `finding.manage`
gate only after the Survey personal source seam. No target-owner disclosure bypasses source
visibility. Outcome Dashboard integration preserves ADR-0055's aggregate count/safe Survey
navigation and personal-response audits. Proposed/new response presentation/history adapter
is Survey-owned, personal-gated with no Admin bypass, and does not duplicate decisions or
expose response-derived identities/counts to non-holders.

## Analytics Area report destination extension (ADR-0069)

These keys are accepted **proposed/new**, not implemented by #1071. Keep existing unfiltered,
legacy and paging behavior. Apply workspace and source authorization before Area filtering,
counts and page limits. A UUID matches only the source's own current `analytics_area_id`;
`unset` matches null. A syntactically valid unknown, foreign or System-incompatible Area yields
an empty authorized result, without catalog existence disclosure. Archived referenced Areas
remain filterable; they are not selectable as new classifications. Browser key is
`filter.analytics_area=<uuid|unset>`; clients translate it to the owning wire query key below.
Grouped report counts and exact list membership must share the owner predicate, including
cross-source availability rules; hidden links are not absent links. These ordinary reads write
no source records or domain audit events. Source repair commands keep their existing gates/audits.

`GET /surveys` gains wire `analytics_area_id=<uuid|unset>`, `status=open`, and `follow_up=needed`.
The existing Survey list response remains an authorized Survey DTO array.
`follow_up=needed` uses the Survey-owned boolean from the ADR-0055 threshold-gated closed Outcome
classifier: at least one currently poor response has resolution `open`. Count/list each Survey once,
regardless of the number of poor responses. Open/draft, below-threshold and no-poor-answer Surveys
never match; a qualifying current Finding or no-follow-up decision clears the corresponding response,
and a Survey clears only when no unresolved poor response remains. Do not compute the filter by
calling personal readers in a loop or exposing a response count/ID or answer-derived filter.
The Survey owner provides a proposed/new grouped safe batch projection for Dashboard composition.

`survey.read` and explicit denies apply, including an explicit deny for an Admin. The report and
ordinary filtered list add no personal-read fields or audits. Survey detail's existing
`/surveys/:surveyId/follow-up` route calls `GET /surveys/:id/outcome-follow-up`; per-response
commands retain fresh personal capability checks and the source's existing read/mutation audits.
A personal-read holder still receives only Survey-grain report metrics.

## GET /surveys/:id/evidence-candidates — proposed/new (#816, ADR-0064)

ADR-0065 selects this endpoint for Finding's approved-excerpt picker; no separate
`evidence-excerpts` endpoint is added. The picker uses a separately authorized
Survey catalog, then these safe pages; it never fetches personal results to
filter client-side. Preserve source/Survey-change reset, distinct response-state/
no-approved-excerpt/error states and fresh submit revalidation. Attachment remains
Finding-owned `POST /findings/:id/survey-evidence` with existing classification
fields, target-first validation/error ordering and metadata-only replay as defined
in `findings.md`. Inventory uses the linked-highlight audience, not this picker
suppression. Neither this selection read nor safe attachment fabricates personal
read audits; actual personal source reads keep existing audits.

Accepted target contract; no route/schema implementation is claimed here.

- **Auth:** authenticated session Actor/workspace; lookup Survey in workspace,
  then `survey.read` on source Managed System. Missing/foreign/source-denied
  (including explicit-denied Admin) returns `404 not_found.record`. Draft returns
  `409 conflict.survey_results_unavailable` only after source access. No personal
  grant is required. Existing explicit personal holders retain below-threshold
  result exceptions; role alone grants no personal access.
- **Query:** strict `{ limit?: integer 1..100, cursor?: opaque string }`, default
  50; no arbitrary text/dimension filters. Stable bounded pages, with an opaque
  cursor containing no response identity. Recheck source permissions, current
  approvals and result suppression on every page. Invalid ID/query/cursor uses
  existing `422 validation.failed` envelope.
- **Response (proposed/new wire shape):** `{ response_state, items, page }`, with
  `response_state: none | below_threshold | visible`,
  `items: [{ approved_excerpt_id, redacted_excerpt, question_label, survey_type,
  survey_display_id, identity_protected }]`, and `page: { has_more, cursor? }`.
  `approved_excerpt_id` is the approval selection reference, not a response ID;
  schemas must be strict. Suppressed/none states have empty items and no numeric
  suppressed count. Cursor is present only for another eligible page.
- **Privacy:** derive state from actual response subjects and per-question answers,
  not approval counts; preserve existing low positive bucket and text-answer
  suppression. A visible Survey may still have suppressed questions. Personal
  holders receive no response UUID in this endpoint. No respondent, response
  deep link, exact submission time, raw answer, Survey title or audit internals.
- **Side effects:** no links, counters or mutation/idempotency entries. Safe picker
  reads write no fabricated personal-read audit. Use existing read rate limiting
  (`rate_limited.actor`); actual personal source reads retain their own audits.

### Derived Finding read cutover (ADR-0064/#740)

Results uses a proposed/new Survey-owned workspace+Survey-ID reader that returns
candidate Finding IDs and target scope only. Source Survey read/privacy and each
Finding's target read gate remain independent, including different Managed
Systems in the same workspace. No personal grant is required merely to discover
already-derived accessible Findings. Active-approved responses retain the shipped
Results action audience even when aggregates are suppressed. Approval-free discovery
requires a cohort at or above the configured threshold; personal access alone does
not enable it. These rules do not expose suppressed question counts or excerpts.
The raw application `core.entity_links` response-ID join is removed; #740 revokes app raw link/audit reads without changing the existing
personal result/follow-up response-ID gates. Linked quotes use the batch Survey
projection with exact-active approval/source/target checks in one transaction
snapshot. Existing attached-highlight audience is not tightened to picker suppression.
