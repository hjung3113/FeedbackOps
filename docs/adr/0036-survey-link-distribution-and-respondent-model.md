# ADR-0036: Survey link distribution and respondent model

Date: 2026-07-30

## Status

Proposed

## Context

The Survey design acceptance criterion says “Survey supports link distribution”
at `docs/design/07-survey-system.md:95`, but the implemented API contract at
`docs/implementation/03-api-contracts.md:846` and `:853` defines the current
form and response routes for authenticated Actors in the same Workspace only.
ADR-0035 establishes the anonymous response and public-scope boundary needed
for a separate link surface.

No audience, recipient, invitee, target, or link-token table exists today.

## Decision

### D1 — Distribution links are opaque, bounded credentials

Introduce `survey.survey_links` with `id`, `workspace_id`, `survey_id`,
`token_digest`, `expires_at`, `revoked_at`, `created_by_actor_id`, and
`created_at`. A link token is a cryptographically random 32-byte value encoded
base64url; only its digest is stored. Each link expires 30 days after creation
and may be revoked at any time. Expired or revoked tokens are invalid for both
form reads and submissions.

### D2 — Links are anonymous distribution, not an audience model

Do not introduce audience, recipient, invitee, or target tables in this slice.
The new `survey_links` table is the whole distribution model: a Survey operator
creates a shareable public link, and possession is not evidence of a named
recipient. `survey_responses.response_link_id` and
`external_respondent_id`, as decided in ADR-0035, record provenance without
inventing a recipient directory.

### D3 — Token possession replaces session authentication only on public routes

On the new public form and submission routes, a valid link token replaces
`requireSession` and supplies the workspace/survey scope described in ADR-0035.
It does not grant an Actor session, any Survey management capability, personal
response access, results access, or access to the existing
`/surveys/:id/form` and `/surveys/:id/responses` endpoints. Those endpoints
remain authenticated exactly as pinned by
`docs/implementation/03-api-contracts.md:846` and `:853`.

### D4 — Delivery channels are out of scope

This ADR covers creating, revoking, and resolving a link only. Email, SMS,
chat, CRM, webhook, QR-code delivery, recipient imports, send history, and
delivery status are out of scope.

### D5 — This realizes the design link-distribution criterion

The public link model in D1-D4 is the decision that realizes
`docs/design/07-survey-system.md:95`. It does not override the API-contract
wording for existing authenticated routes; instead it adds the explicitly
separate public-link contract required by ADR-0035.

## Consequences

- A copied link can be used by anyone until expiry or revocation.
- There is no named-recipient completion report and no person-level response
  guarantee; the anonymous deduplication limit is stated in ADR-0035.
- Later delivery work can add recipients and deliveries without changing the
  link credential's workspace and Survey binding.

## Alternatives rejected

- Requiring authentication in addition to the token: rejected because it does
  not satisfy external unauthenticated responses.
- Embedding workspace or survey IDs in a signed URL as the only credential:
  rejected because individual revocation and opaque resource discovery require
  a server-side link record.
- Building recipients and sending channels now: rejected because link
  distribution does not require a delivery system.

## Reopening triggers

Reopen for named invitations, delivery tracking, configurable link lifetime,
multiple submissions per link, password-protected links, or a requirement to
identify respondents.
