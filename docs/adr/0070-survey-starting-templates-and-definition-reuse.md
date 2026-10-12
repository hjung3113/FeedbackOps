# ADR-0070: Survey starting templates and definition reuse

## Status

Accepted 2026-10-13 by the owner (#1047, owner decisions 57-1/57-2/57-3).
Amends [ADR-0039](0039-survey-creation-requires-a-dialog.md) and narrows
[ADR-0059 D2](0059-deferred-mvp-requirements-from-doc-audit.md).

Delivery is split: #1073 supplies the built-in backend/shared contract;
#1074 supplies existing-definition reuse; visible dialog selection (#1075)
remains pending. #1073 alone does not complete #1047's
user-visible acceptance.

## Context

A first-time operator needs usable questions before entering the builder, and
an operator repeating a custom round needs an independent definition snapshot.
An editable template library would introduce persistence and an Admin surface
beyond this MVP close-out. The owner chose three server-owned starters and
same-Managed-System existing-question reuse instead.

## Decision

### Sources and explicit choices

Surveys owns the catalog and creation command; shared owns pure schemas.
Use the existing `survey.surveys` and `survey.survey_questions` tables, with no
saved-template table, template editor, scheduler, or new permission.

The immutable IDs `discovery-basic`, `validation-basic`, and `outcome-basic`
start at version 1. Definition content changes require a new version. The
normative Korean questions, options and rating labels are recorded in
[the Survey API contract](../implementation/api/surveys.md#built-in-definitions-version-1).
Symbolic question keys identify preview definitions without pretending to be
persisted question UUIDs. Outcome uses a positively oriented 1–5 usefulness
rating; 1–2 is the low band under ADR-0055. It measures post-release usefulness,
not automatic before/after causality or Task completion.

`POST /surveys` adds an optional strict discriminated `starting_point`:
`{ kind: 'builtin', template_id, version }` (#1073) or
`{ kind: 'existing_survey', survey_id, definition_token }` (#1074). Omission preserves blank creation. The explicit type
must match the chosen source, otherwise `422 validation.failed`. Client
question bodies are never accepted at this route.

Existing-source eligibility (#1074) is same Workspace, same selected active
Managed System, nonempty valid definition, and source status draft/open/closed.
The Actor needs both `survey.read` and `survey.manage` on the source; explicit
denies dominate Admin fallback. Personal-response permission is neither needed
nor granted. Target system, Analytics Area and operator validation retain the
ordinary creation rules.

### Private reads and stale definitions (#1074)

All reads/create use session and matching Workspace guards, strict query/body
schemas and existing read/mutation rate tiers. Source reads are private/no-cache.
The built-in catalog is `GET /surveys/templates?managed_system_id=<uuid>` after
active-system and `survey.manage` validation.

The source discovery endpoint is
`GET /surveys/copy-sources?managed_system_id=<uuid>&q=...&limit=...&cursor=...`:
metadata only (ID, Display ID, title, type, status, question count), newest
first, stable `(created_at,id)` cursor, default limit 20, maximum 50. It must
not load every definition or join responses/answers/VOC/Task. Measure its plan
before justifying any index migration.

`GET /surveys/:id/copy-source` returns source ID/Display ID/title/type,
allowlisted questions and an opaque definition token, from one consistent
snapshot in a short transaction. The token covers type, system, ordered
question IDs and all copied definition fields; Survey `updated_at` alone is
insufficient because questions mutate independently.

On an idempotency miss, lock the source Survey and questions with the existing
Survey-owned lock seams, then recheck scope/read/manage, eligibility, graph
validity and token. Missing/foreign/unreadable source is indistinguishable
`404 not_found.record`; readable without manage is `403 permission.denied`;
authorized system/type mismatch or empty/invalid graph is `422 validation.failed`;
changed token is `409 conflict.stale_write`. Never silently repair, truncate or
fall back to a blank draft.

### Atomic definition snapshot

One application command runs inside the existing transaction/idempotency seam.
Create a new draft with fresh Survey ID/Display ID and fresh question IDs.
Copy only kind, prompt, required flag, option keys/labels, rating bounds/labels,
visible order and branch definitions. For existing sources, remap parent IDs,
retain trigger keys, insert top-level parents before children independently of
visible order, and keep dense visible order. Validate the complete graph;
any insert, validation or audit failure rolls back the draft, questions,
audits, Display ID counter and idempotency success together. Public question
mutation routes and the frontend sequential save loop are not the copy command.

Title is submitted by the current Actor; suggestions remain editable.
Description is entered independently for the new run. The Actor explicitly
selects Primary Managed System and privacy, selects optional Analytics Area
anew, and receives current operator resolution (explicit → system default →
creator). Never inherit old operator/creator/privacy/area. Lifecycle starts as
draft with fresh timestamps and null opened/closed times. Copy no responses,
answers, approvals, results, follow-up decisions, links, Findings or distribution
state. Later source and target edits are independent.

Preserve the compact `201` metadata response, without questions, so it stays
within the existing 16 KiB idempotency cache boundary (ADR-0015). Fetch persisted
detail on builder entry. Same Actor/key/body replays the same graph; changed
body/source/token with that key conflicts. Source validation belongs inside
the miss path so a completed replay does not reread a changed source.

Keep `survey_created` and one structural `survey_question_created` per question
in the transaction. Extend the strict registered creation detail with optional
`starting_point` (built-in kind + ID/version, or source kind + Survey ID) and `question_count`. Never audit prompts, labels, title, answers
or excerpts. Authoring provenance stays in this audit: create no Entity Link
or relation type.

### Focused dialog extension (#1075)

Extend ADR-0039's shipped dialog, with blank creation as its initial mode and
“기본 템플릿” / “기존 Survey 문항 사용” choices. System and privacy start
unselected, including after choosing a source. Only after explicit system
selection load sources for that system and show metadata and compact previews.
Type/title suggestions are visible; changing type/system/source clears an
incompatible source/preview while preserving independently typed title/description.
Cancellation resets the dialog. This creates a new Survey; it never overwrites
an existing builder.

Use `apiRequest` and shared response schemas for reads and the touched create
hook; malformed responses render an error and never navigate to an invented ID.
Preserve input on lookup/create errors, distinguish lookup failure/loading from
no sources, and keep blank mode available when optional reads fail. Permission
loss or stale token blocks the selected source until refresh/reselection.
Keep one explicit idempotency key for an unchanged pending/uncertain attempt;
an edited attempt gets a new key. Block closing while creation is pending.
Cancel/Escape before submission writes nothing. Preserve the existing list URL
context and navigate only with the returned persisted server ID.

## Consequences

ADR-0059 D2 is narrowed only as each delivered slice lands. The built-in backend
contract is #1073; existing-source backend/shared reuse is #1074 and the dialog
(#1075) remains pending. An editable template library and
advanced logic stay outside this scope. ADR-0039's explicit system/privacy,
persisted-ID navigation, focused dialog and keyboard reorder requirements remain
in force. ADR-0033 anonymity and ADR-0055 Finding-first follow-up stay unchanged.
