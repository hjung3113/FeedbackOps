# Authentication

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Authentication

```text
GET /auth/login
GET /auth/callback
GET /auth/mock-login
POST /auth/mock-login
POST /auth/logout
GET /me
```

`GET /auth/login` starts the configured provider's login flow and accepts an
optional `return_to`. `GET /auth/callback` completes the OIDC login flow.
`GET /auth/mock-login` and `POST /auth/mock-login` return `404 not_found.record`
when `NODE_ENV` is `production` or the configured provider is not `mock`.
`POST /auth/mock-login` accepts `{ external_id }` and issues a session cookie.
`POST /auth/logout` revokes the session from the request cookie when present,
clears the cookie, and returns `204`.

`GET /me` requires a valid session and workspace membership; it returns the
session Actor's identity and `workspace_id`.
