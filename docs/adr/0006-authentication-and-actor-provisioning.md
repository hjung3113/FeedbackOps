# Authentication, sessions, and Actor provisioning

FeedbackOps authentication runs through an internal corporate identity provider that has not yet been provisioned. MVP development cannot wait for that procurement, so this ADR defines an **AuthProvider abstraction with two implementations** and the session/provisioning rules that both must honor.

## AuthProvider abstraction

A single interface in `apps/backend/src/modules/auth` is the only thing the rest of the system touches:

```text
AuthProvider
- startLogin(req): returns the redirect or mock-login response
- completeLogin(callbackParams): returns { external_id, email, display_name, raw_claims }
- logout(session): revokes the session record
```

Two implementations swapped by `AUTH_PROVIDER` env var:

- `MockAuthProvider` — for local dev and CI. Serves a `/auth/mock-login` page (dev-only, refused with 404 unless `NODE_ENV !== 'production'`) listing seeded users (one Admin, one Developer per seeded Managed System scope, one User). Selecting a user issues a session immediately.
- `OidcAuthProvider` — for staging and production. Uses [`openid-client`](https://github.com/panva/openid-client) (IETF-spec-correct, Filip Skokan). The IdP is OAuth-family (the corporate procurement points at OAuth/OIDC); concrete IdP (Azure AD, ADFS, Keycloak, etc.) is configured by env vars `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`. The mock provider stays in the bundle so demos and tests do not depend on a live IdP.

The auth module exposes only the abstraction to the rest of the codebase. Application services, controllers, and route guards must never branch on provider type.

## Session strategy

Sessions are stored server-side in a Postgres `core.sessions` table and identified by an opaque random ID delivered as an **httpOnly, Secure, SameSite=Lax cookie** named `fops_session`.

```text
core.sessions
- id              text primary key (opaque, 32+ bytes random, base64url)
- actor_id        uuid not null references core.actors
- workspace_id    uuid not null references core.workspaces
- expires_at      timestamptz not null
- last_seen_at    timestamptz not null
- created_at      timestamptz not null
- revoked_at      timestamptz null
- created_user_agent_summary text null
- created_ip_summary text null
```

JWT was rejected because revocation requires either a blocklist (defeating statelessness) or short TTLs with refresh tokens (more moving parts). The audit story for `Sensitive Permission` decisions in `docs/implementation/05-permission-policy.md` requires that logout, role changes, and permission revocations take effect immediately — opaque session IDs with a server-side store give that for free.

## Actor provisioning on first login

On every successful `completeLogin`, the auth module:

1. Looks up `core.actors WHERE external_id = claims.sub`.
2. If found, updates `email` and `display_name` if the claim differs, then issues a session.
3. If not found, inserts a new `core.actors` row with `role_level = 'User'`, `actor_type = 'internal_member'`, the workspace resolved as described below, then issues a session.

This matches the spec: `docs/design/09-permission-access.md` already states the default actor type is `Internal Member`, and `docs/design/04-voc-system.md` says any AD-authenticated Actor can submit VOC without a Permission Request — both presume that authentication itself is the first authorization gate.

Batch import from AD and admin-managed invite whitelisting were rejected: batch import requires a `read-all-users` AD scope and a sync pipeline that we do not need for a workforce already gated by AD; invite whitelisting adds an admin step that produces no security gain in an environment where AD already controls who can log in at all.

## Role Level mapping

MVP maps Role Level **manually**: Admin promotes Actors via the Admin UI after first login. AD-group-driven mapping (claims.groups → Role Level) is a follow-up ADR once the concrete IdP and its group schema are known; making it up before that risks baking a vendor-specific assumption into the domain layer.

The fallback for a freshly provisioned Actor is `User`, which can submit their own VOC, view their own `Reporter Summary`, and access assigned Surveys — nothing else. This matches `docs/design/09-permission-access.md` user-level scope.

## Workspace resolution in MVP

The Workspace glossary entry (CONTEXT.md) is multi-tenant first-class because the data contracts in `docs/design/15-data-contracts.md` carry `workspace_id` on every record. **MVP runs with a single seeded Workspace** whose ID is loaded from `WORKSPACE_ID` env var; every Actor and record is bound to that ID. The multi-tenant model is preserved in the schema so a later ADR can flip the resolution rule to claim-based (e.g. tenant id from `iss` or a custom claim) without a migration.

## What this ADR locks

- One auth abstraction, two implementations, never branched on outside the auth module.
- Opaque server-side sessions in Postgres; no JWT.
- First-login auto-provisioning at `role_level = User`; no batch sync, no invite whitelist.
- Manual Role Level promotion; no AD-group mapping until the IdP is fixed.
- Single seeded Workspace ID for MVP; multi-tenant schema preserved.

## Reopening

Switching to JWT, batch AD sync, or AD-group-driven Role mapping each warrants a new ADR with a migration story for existing sessions, actors, and audit records. Adding a real `OidcAuthProvider` configuration is *not* a reopen — it is the expected outcome of the procurement and slots into the abstraction this ADR defines.
