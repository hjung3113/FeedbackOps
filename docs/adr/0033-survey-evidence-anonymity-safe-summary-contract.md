# ADR-0033: Survey evidence-source identity, response protection, and safe-summary contract

Date: 2026-07-19

## Status

Accepted.

Amended by ADR-0053.

## Context

Survey responses can be evidence without being broadly visible personal data. The product needs a durable distinction between an aggregate Survey and an individual response before submission, linking, and result surfaces are added.

## Terminology

- **Identified response:** a response whose identity is not protected.
- **Identity-protected response:** a response with immutable `identity_protected=true`; its respondent remains restricted source data.
- **Personal response:** an individual response or answer that can expose a respondent or correlatable response record.
- **Aggregate:** a grouped result that does not expose personal response data.
- **Safe summary:** a deterministic, allowlisted aggregate representation.

## A — Evidence source identity

`survey`, `survey_response`, and future `survey_result` are distinct source identities. Aggregate-derived Finding provenance points to a Survey or Result; per-response evidence points to `survey_response` and is never collapsed into a generic Survey ID. A Survey source never creates a VOC.

## B — Storage and identity-protection placement

Identity protection is a response-level immutable snapshot. The respondent Actor reference remains stored for abuse prevention, assignment, deduplication, and authorised source-route access; protection does not mean the database lacks identity. Answers inherit their response's protection level.

## C — Permission semantics

`survey.read` is non-sensitive Managed System read access; Admin may bypass it and Developers need a scoped grant. `survey.manage` is sensitive Managed System access for authoring and lifecycle commands, with the same Admin/scoped-grant behaviour. `survey.read_personal_responses` is sensitive Managed System access with **no role bypass, including Admin**. `survey.export` is sensitive Managed System or workspace access, also with no role bypass. Personal read and export are independent; export of personal data requires both. Explicit deny remains dominant, and Analytics Area never changes authorization scope.

## D — Anonymity threshold

The default threshold is five responses and is applied after every effective filter. Counts below five are hidden or merged, never rounded into an identifying bucket. Adjacent or overlapping queries must not permit subtraction attacks that recover a protected segment.

## E — Deterministic safe summaries

Safe summaries are backend templates, not LLM output. Locale may vary template text but never source facts. The same authorised inputs produce the same semantic summary.

## F — Safe-summary allowlist

Only these fields may appear: Survey type/display ID; question identifier or approved label; aggregate count when threshold permits; configured answer labels; score band rather than identifying exact score; approved tags; an explicitly approved redacted excerpt; and `identity_protected=true`.

## G — Forbidden fields

Never expose Actor ID, name, email, external ID, correlatable response ID, exact submission time, session/IP/user-agent/assignment metadata, raw free text, unredacted excerpts, unique answer combinations, below-threshold filter values or counts, or personal permission/audit internals.

## H — Linked-surface contract

Linked objects receive a safe summary only. Full response access requires navigation to the Survey source route and a fresh capability check. Finding, Task Request, Task, VOC, and entity-link DTOs never copy raw responses.

## I — Audit and logging

When implemented, personal-response reads and exports require audit records. Logs and audit details must not copy raw answers.

## J — #184 versus #185/#187 scope

#184 establishes this contract and stores the foundation schema only. #185 owns response submission. #187 owns provider, tuple, and shared entity-link extensions.

## Consequences

The schema stores response identity safely enough for future authorised flows, while role grants prevent response insertion before #185. Consumers must use safe summaries rather than treating an aggregate Survey and a response as interchangeable evidence.

## Alternatives rejected

- Admin personal-response bypass: rejected because elevated role is not a personal-data need-to-know grant.
- LLM-generated summaries: rejected because non-determinism weakens review and redaction guarantees.
- Pre-filter thresholding or rounded small buckets: rejected because both allow filter differencing and subtraction attacks.
- One generic Survey source ID: rejected because it loses provenance and can attach personal evidence where aggregate evidence was intended.

## Reopening triggers

Reopen this ADR for threshold customization, truly anonymous responses with no stored Actor, LLM-assisted summaries, cross-workspace research/export, or a new linked surface that needs richer fields.

## Addendum — Slice 9 workspace configuration

The anonymity threshold is workspace-configurable in `core.workspace_settings`.
The configured value retains a hard floor of five, which remains this ADR's
baseline protection; values below five are invalid. Storage and the admin
settings API land in #195. Survey result and other consumer wiring is deferred
to #196, so this addendum does not weaken the safe-summary contract.

## Addendum — #548 respondent-owned response history

The authenticated session Actor may read their own response-history metadata
through `GET /me/survey-responses` without `survey.read_personal_responses`.
The projection is restricted in SQL to the session workspace and respondent
Actor and returns only Survey ID and title, submission time, and the immutable
`identity_protected` flag. Identity protection does not hide a response from
its own respondent; this route reveals no answers or other respondents' rows
and grants no operator read access. Self-history reads are not audited because
the reader is the data subject. The projection omits response IDs as defense in
depth: it adds no new respondent-to-response link. (#569 closed the direct
database-role join: since migration 0057 `fops_app` has no `SELECT` on
`survey.survey_response_excerpt_approvals.response_id`. The audit-mediated
variant — approval audit rows whose `detail` carries both the response and the
approval id, joined to the still-selectable approval id and redacted excerpt —
remains and is tracked in #569 follow-ups.) All other
personal-response reads and exports retain the explicit capability requirements
in this ADR.

## Addendum — #569 / #737 identity-protection guarantee scope (owner decision 2026-10-03)

The identity protection this ADR promises is defined as:

1. **API authorization.** Respondent identity, response IDs, raw answers and personal excerpts reach an Actor only through
   the capability gates in this ADR (`survey.read`, `survey.read_personal_responses`, `survey.manage`), with the per-row
   personal-read audits in section I.
2. **Direct-table isolation for the application role.** `fops_app` cannot read the respondent↔response binding directly
   from the Survey response tables or from `survey.survey_response_excerpt_approvals.response_id` (migration 0057). Narrow
   `SECURITY DEFINER` readers project only what the API needs.

It is **not** a guarantee of SQL-level unlinkability against a compromised `fops_app` database handle. Such a handle can
still compose app-executable Survey definers, audit `detail` linkage, Finding / evidence-highlight provenance and
internal-only `survey_response` entity links. The owner accepted this residual because the API surfaces are gated and
audited, and because a compromised application handle already reaches far broader workspace data. A trusted read boundary
that arbitrary `fops_app` SQL cannot invoke (a separate role, connection or service) was considered and deferred.

Consequences:

- Audit `detail` linkage is unchanged. ADR-0008's actor attribution and append-only history stay as they are (#738 closed
  under this decision).
- Further direct-table hardening of the remaining single-table paths (#739 Finding/highlight provenance, #740 internal
  entity links) is optional defense in depth, decided per issue after a cost review.

Reopening trigger: a requirement for unlinkability against a compromised application database credential, or an
application route that exposes any of the residual paths.
