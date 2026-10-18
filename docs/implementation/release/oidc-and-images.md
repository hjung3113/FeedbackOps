# Production images and local OIDC check

This local stack exercises the production backend and frontend images, the separate migration job, S3-compatible attachment storage, and the OIDC authorization-code path. It uses NODE_ENV=development so the existing config allows the localhost issuer and redirect URI and the browser can receive non-Secure cookies over HTTP.

The local run verifies OIDC discovery/code flow, backend session issuance and revocation, and first-login Actor creation. It does not verify TLS. Production requires an HTTPS issuer and redirect URI and always sets Secure on session and OIDC transaction cookies; verify those properties when connecting the company IdP.

## Prepare the isolated release project

From the repository root, create the local interpolation file and inspect the Compose configuration:

    cp .env.release.example .env.release
    docker compose --project-name feedbackops-release-1060 --env-file .env.release -f docker-compose.release.yml config

The example values are local-only. The Compose project is always named feedbackops-release-1060; its Postgres and MinIO named volumes are project-owned. The Postgres port is not published on the host, so this stack does not use the development database on port 5434. The --env-file supplies Compose interpolation only; selected values are passed to each service explicitly so the running backend never receives DATABASE_URL_MIGRATE.

Postgres initialization mounts [scripts/db/init.sql](../../../scripts/db/init.sql) and runs it as the postgres bootstrap superuser on an empty release-owned volume. Do not set POSTGRES_DB=feedbackops: init.sql creates that database itself. It also creates the fops_app and fops_migrate logins, their role memberships, and the vector extension. Their initial passwords are the literals fops_app and fops_migrate from that script; changing POSTGRES_PASSWORD changes only the bootstrap superuser password.

The initialization script runs only for an empty Postgres volume. Before reusing an existing volume, provision feedbackops owned by fops_migrate, both login roles with the script's passwords and NOINHERIT, all NOLOGIN owner roles and one-way memberships from the script, and the vector extension in feedbackops as a superuser. Do not assume the init script will repair an existing volume.

## Build, migrate, seed, and start

The smoke script builds all three images, starts Postgres, the OIDC provider, and MinIO, then starts the migration job and waits up to three minutes for it to exit successfully. Only after migration succeeds does it start bucket provisioning, the backend, and frontend; it then probes the frontend/API routes and waits up to two minutes for database, pg-boss, and storage readiness:

    bash scripts/release/image-smoke.sh

The migration job runs only drizzle-kit migrate; it never seeds. After it succeeds and before logging in, run the repeatable core baseline seed from the migration/tools image:

    docker compose --project-name feedbackops-release-1060 --env-file .env.release -f docker-compose.release.yml run --rm -e SEED_MODE=core migrate node_modules/.bin/tsx src/seed/index.ts

The tools image includes the backend development dependency closure because db:seed uses tsx. The command receives both DATABASE_URL (the fops_app runtime role used by the core seed) and DATABASE_URL_MIGRATE (the fops_migrate role used to create the seed team). It also receives the same WORKSPACE_ID as the backend. Core mode creates the Workspace, baseline Actors, Tableau and Power BI Managed Systems, Analytics Areas, team, and core VOC fixtures; it does not create personas or scale data.

Before the backend starts, the release stack runs the existing idempotent apps/backend/src/cli/storage-bootstrap.ts command against MinIO. It checks the configured bucket and creates it only when it is missing.

Open http://localhost:4173/ and use the login screen. The flow navigates to /auth/login, redirects the browser to the mock provider at http://localhost:8080/default, and returns to http://localhost:4173/auth/callback. On the mock provider form, enter a new subject such as release-user-1. The JSON_CONFIG mapping returns sub, email, email_verified=true, and name based on that username.

After callback, verify the session by confirming the frontend's GET /me returns 200 in the browser Network panel and includes the new Actor. The first login creates an Actor with Role Level User and type internal_member. Log out through the app; POST /auth/logout revokes the local session and clears the session cookie only, with no IdP logout redirect. Start another login as a different subject, such as release-user-2, and verify that it creates a separate Actor and session.

Register a VOC from the app using one of the seeded Managed Systems. If the active Workspace has no Managed System, an Admin must create one first in Admin → Managed Systems; first-login Actors are User and cannot create Managed Systems. Core seed normally supplies Tableau and Power BI, so no manual setup is needed for a fresh release volume.

The provider README for tag 6.0.4 documents interactive login, tokenCallbacks/requestMappings, username claim substitution, and authorization code with PKCE S256. It does not document client-secret validation at the token endpoint or the ID Token nonce behavior required by the backend. The Compose config uses only the documented settings; the conductor must verify those interoperability details during the runtime check.

The release stack publishes host ports 4173 (frontend), 8080 (OIDC provider) and 3001 (backend, through the provider's network namespace). Stop a local development backend on port 3001 before `image-smoke.sh`, or `docker compose up` cannot bind the port.

## Routes and image behavior

The nginx proxy preserves the original URI and query string for backend requests, and preserves redirect and cookie response headers:

| Request | Destination |
| --- | --- |
| /assets/* | Static files with long-lived immutable caching |
| /index.html | Static SPA entry with Cache-Control: no-cache |
| /auth/*, /attachments/*, /health, /health/* | Backend regardless of Accept |
| Other GET/HEAD with Accept containing text/html | Existing static file, then /index.html for SPA routes |
| All remaining requests | Backend |

The backend-only prefixes match the auth routes in apps/backend/src/modules/auth/routes.ts (GET /auth/login, GET /auth/callback, POST /auth/logout), the attachment routes in apps/backend/src/modules/attachments/routes.ts (POST /attachments, GET /attachments/:id/download), and health routes in apps/backend/src/modules/core/health/routes.ts (GET /health, /health/live, /health/ready). Frontend call sites include apps/frontend/src/routes/login.tsx (login navigation), apps/frontend/src/lib/api/auth.ts (/me and logout), apps/frontend/src/lib/api/attachments.ts (upload), and apps/frontend/src/features/voc/components/detail/AttachmentChip.tsx (download). Shared SPA/API paths such as /vocs therefore use the HTML navigation split, while JSON requests continue to the backend.

Nginx allows 26 MiB request bodies for the backend's 25 MiB attachment limit, forwards Host, X-Forwarded-For/Host/Proto and cookies, passes request bodies, and forwards Set-Cookie. The local backend sets TRUSTED_PROXY_HOPS=1 for the single nginx hop and keeps PUBLIC_ATTACHMENT_ORIGIN at the quoted literal 'self' for same-origin downloads.

## Company IdP and Kubernetes configuration

Register the exact callback URI https://<frontend-host>/auth/callback. The company IdP must provide:

- OIDC_ISSUER_URL: absolute HTTPS issuer URL without query, fragment, or credentials.
- OIDC_CLIENT_ID and OIDC_CLIENT_SECRET: non-empty client credentials. The backend uses the OIDC client's client_secret_basic default when supported by discovery.
- OIDC_REDIRECT_URI: absolute HTTPS URL whose path is exactly /auth/callback, with no query or fragment.
- OIDC_SCOPES: single-space-separated scopes including openid; request email profile for the profile claims below.
- ID Token claims: non-empty string sub and email; email_verified may be absent but must not be false; name is preferred for the display name, then preferred_username, then the email local part. The backend verifies issuer, audience, expiry, signature, state, nonce, and PKCE S256. Its bounded raw-claim allowlist is sub, iss, aud, email, email_verified, name, and preferred_username.

For Kubernetes, supply non-secret runtime config through the workload environment and secrets through Kubernetes Secret objects per ADR-0013:

- Runtime config: NODE_ENV=production, HOST, PORT, AUTH_PROVIDER=oidc, WORKSPACE_ID, TRUSTED_PROXY_HOPS, PUBLIC_ATTACHMENT_ORIGIN, PLATFORM_RETURN_ORIGINS (empty = off, ADR-0071), OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPES, and STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_BUCKET, STORAGE_S3_FORCE_PATH_STYLE.
- Runtime secrets: DATABASE_URL for fops_app, OIDC_CLIENT_SECRET, STORAGE_S3_ACCESS_KEY_ID, and STORAGE_S3_SECRET_ACCESS_KEY. If enabled, also supply SMTP_PASSWORD with SMTP_HOST, SMTP_PORT, SMTP_USERNAME, and SMTP_FROM; or EMBEDDING_API_KEY when EMBEDDING_PROVIDER=voyage.
- Migration job only: DATABASE_URL_MIGRATE for fops_migrate. Do not mount it in the backend workload.

The images emit backend structured JSON logs to stdout per ADR-0013. They do not add metrics or tracing. No ADR-0013 amendment is needed for this local stack: its deployment, health, logging, and secret-handling facts remain accurate.

## Stop and cleanup

To stop the stack and remove its database and object-storage volumes, use the script's project-scoped option:

    bash scripts/release/image-smoke.sh --down

Equivalent Compose operations must use the same project, file, and interpolation input:

    docker compose --project-name feedbackops-release-1060 --env-file .env.release -f docker-compose.release.yml down -v
