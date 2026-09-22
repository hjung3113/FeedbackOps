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

## Amended 2026-09-22

`OidcAuthProvider` is implemented (issue #390), still behind the same seam: application code and route handlers never branch on provider type; only the pre-existing mock-only routes (`/auth/mock-login`) and the mock-only `/auth/callback` 404 guard name a provider.

### Env contract

`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` are required when `AUTH_PROVIDER=oidc` (one validation issue per missing variable, at that variable's path) and ignored when `AUTH_PROVIDER=mock`. `OIDC_SCOPES` defaults to `openid email profile` and must include `openid`. Rules, all enforced at config load (`config-oidc.ts`), with messages that never echo a value — only variable names and rule descriptions:

- `OIDC_ISSUER_URL`: absolute URL, no query, no fragment, no credentials; https, except plain `http://localhost[:port]` / `http://127.0.0.1[:port]` outside production.
- `OIDC_REDIRECT_URI`: absolute URL, no query string (including a bare `?`) or fragment, path exactly `/auth/callback`; https in production (http localhost/127.0.0.1 allowed otherwise).
- `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`: non-empty after trimming.

### Endpoints

`GET /auth/login` (provider-agnostic, optional `?return_to=`) starts a login; the mock provider keeps serving its dev-only HTML picker through it (still 404 in production), the OIDC provider returns a 302 to the IdP. `GET /auth/callback` receives the IdP authorization response and issues the session exactly like `POST /auth/mock-login` (same provisioning path, same cookie options), then redirects to the sanitized `return_to` or `/`. `/auth/logout` and `/me` are unchanged.

### Flow security

- Authorization code flow with **PKCE S256**, plus `state` and `nonce` on every authorization request.
- Per-login `state`/`nonce`/PKCE verifier ride in a signed short-lived transaction cookie `fops_oidc_tx` (Path=/auth, HttpOnly, SameSite=Lax, Secure in production, Max-Age 600). Value: `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(key, "oidc-tx-v1." + payloadB64))`, with the key derived from the client secret via `createHmac('sha256', clientSecret)` over the `fops-oidc-tx-v1` domain-separation label. Signature compared with `timingSafeEqual`. Single use: cleared on every callback attempt, success or failure.
- `return_to` is honored only if it starts with a single `/` (no protocol-relative `//`, no backslash, no CR/LF); anything else falls back to `/`.
- ID Token verification is delegated to `openid-client` (`authorizationCodeGrant` with `expectedState`, `expectedNonce`, `pkceCodeVerifier`, `idTokenExpected`), which validates issuer, audience, expiry, signature against the discovered JWKS, and the code/PKCE binding at the token endpoint. The IdP's `error`/`error_description` response parameters are rejected generically — never echoed.

### Claims mapping and audit bounds

`sub` and `email` are required string claims. `display_name = name ?? preferred_username ?? email local-part`. `raw_claims` — the only provider payload persisted — is bounded to the allowlist `{sub, iss, aud, email, email_verified, name, preferred_username}`; access/refresh tokens and the full ID Token payload never leave the provider.

### Fail-closed boot

IdP discovery runs inside `buildServer`'s provider switch, before the HTTP listener starts; a discovery failure rejects boot with a curated error naming the issuer host only — never the URL's credentials, the secret, or the IdP response body. Production continues to refuse `AUTH_PROVIDER=mock` at boot (unchanged).

### Log redaction

`req.url` carries the one-time authorization code on `/auth/callback`, so both logger constructions (the process root logger and Fastify's inline logger options) serialize requests through `redactSensitiveQuery`, which replaces the values of the query keys `code`, `state`, `id_token`, `access_token`, `refresh_token`, `session_state`, `error_description`, `client_secret` with `[redacted]` while keeping keys and order.
