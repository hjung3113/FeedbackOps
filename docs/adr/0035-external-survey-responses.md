# ADR-0035: External survey responses

Date: 2026-07-30

## Status

Proposed

Supersedes the authenticated-Actor-only respondent rule for the new public-link
surface described here. It does not supersede ADR-0033's identity-protection,
safe-summary, permission, or audit decisions.

## Context

Today every Survey route uses the `requireSession` plus
`requireWorkspace(WORKSPACE_ID)` preHandler pair. The only routes without that
pair are `GET /health`, `GET /auth/mock-login`, `POST /auth/mock-login`, and
`POST /auth/logout`. `requireSession` reads the opaque `fops_session` cookie;
without it, it returns `401 auth.session_invalid` before a handler runs.

Workspace scope is exclusively `req.session.workspace_id`, and survey route
`actor(req)` also requires that session. Every survey repository predicate is
therefore session-scoped today. An unauthenticated respondent has neither an
Actor nor a workspace ID.

`survey.survey_responses.respondent_actor_id` is currently a NOT NULL foreign
key to `core.actors`, with the only one-response guarantee being unique
`(survey_id, respondent_actor_id)`. There is no anonymous identity, invitee,
recipient, audience, or link-token model. ADR-0006 provisions an
`internal_member` Actor only on first login; it is not an external respondent
provisioning mechanism.

ADR-0033 explicitly names “truly anonymous responses with no stored Actor” as
a reopening trigger at
`docs/adr/0033-survey-evidence-anonymity-safe-summary-contract.md:74`.

`docs/design/07-survey-system.md:95` says that Survey supports link
distribution, while `docs/implementation/03-api-contracts.md:846` and `:853`
limit the existing form and response endpoints to an authenticated Actor in the
same Workspace. The API contract remains authoritative for those existing
endpoints; this ADR and ADR-0036 define separate public-link endpoints rather
than silently widening them.

## Decision

### D1 — External responses store no Actor

The migration makes `survey_responses.respondent_actor_id` nullable for public
responses. It adds a nullable immutable `external_respondent_id` opaque UUID
and a nullable `response_link_id` foreign key to the link table defined in
ADR-0036. Authenticated submissions continue to store an Actor and leave
`external_respondent_id` null; public submissions do the inverse. No Actor row
is auto-provisioned for an external respondent.

### D2 — Deduplication is per presented identity, not per real person

The migration replaces the current unqualified
`(survey_id, respondent_actor_id)` unique index with partial unique indexes on
`(survey_id, respondent_actor_id)` when the Actor is present and
`(survey_id, external_respondent_id)` when it is present. The external UUID is
held in a first-party, HttpOnly response cookie and is never returned in a DTO.

This preserves one response for a retained browser identity, but it does not
guarantee one response per real-world respondent: a user can clear the cookie,
use another browser, or receive a shared link. That guarantee is deliberately
lost for anonymous links and must not be claimed by reporting or product copy.

### D3 — A valid link supplies public workspace scope

Public form and submission routes resolve a non-expired, non-revoked link
before reading a Survey. `survey_links.workspace_id` and `survey_links.survey_id`
are the sole public request scope; the handler passes that resolved scope to
public-specific application services and repositories. The token is never
accepted as a workspace ID supplied by the client, and public routes do not
call session `actor(req)`.

### D4 — Public submissions use token-plus-IP rate limiting

Public form reads and submissions have a route-level limiter keyed by the
resolved link ID plus `req.ip`; submission limits use the mutation tier or a
stricter dedicated public-mutation tier. The global limiter currently keys
authenticated traffic by session Actor and otherwise by IP, and exempts only
`/health`; that is insufficient as the public-link abuse control. Proxy trust
must remain bounded so `req.ip` cannot be client-spoofed.

### D5 — ADR-0033 remains the protection contract

This ADR realizes ADR-0033's line-74 reopening trigger only for the stored
Actor assumption. `identity_protected`, safe-summary restrictions, personal
read capability, and audit/logging prohibitions remain unchanged. Public
responses are identity-protected by default and cannot make the new opaque
external identifier visible on any linked surface.

## Consequences

- This is a schema and route-boundary migration; no existing authenticated
  endpoint becomes public.
- Abuse prevention is link and browser-identity based, not person verified.
- Operators can revoke a link to stop future public reads and submissions, but
  revocation does not delete already submitted responses.

## Alternatives rejected

- Auto-provisioning external Actors: rejected because ADR-0006 defines Actors
  as first-login internal members and fabricated Actors would imply identity
  and permission semantics that do not exist.
- Keeping `respondent_actor_id` NOT NULL with a shared anonymous Actor:
  rejected because it makes all anonymous responses collide under the current
  uniqueness rule and creates a misleading identity record.
- Widening `/surveys/:id/form` and `/surveys/:id/responses`: rejected because
  it would contradict the authenticated-Actor API contract and expose a
  session-scoped route without a workspace credential.

## Reopening triggers

Reopen for verified individual invitations, SSO-gated external portals,
cross-workspace links, a requirement to restore one-response-per-person, or a
need to retain identifiable respondent data.
