# ADR-0071: Return-to-platform parameter with platform origin allowlist

## Status

Accepted 2026-10-19.

## Context

The analytics platform links into FeedbackOps in a new tab (analytics-platform ADR-0045 /
analytics-platform#81). Users who arrive that way have no way back to the platform page they
came from. The link target is a URL carried in the query string, so an unchecked value would be
an open redirect: only origins the deployment explicitly trusts may ever become a link.

## Decision

1. **Key.** `platformReturn`: an absolute URL of at most 2048 characters. Only `/vocs`, `/tasks`,
   `/surveys` and `/surveys/$surveyId` accept it; every other route's strict search schema keeps
   rejecting it. The Survey detail's child routes (`/results`, `/follow-up`) inherit the key in the URL but never render the link. It is separate from the internal recovery `returnTo` key, whose behaviour is
   unchanged.
2. **Allowlist.** Backend env `PLATFORM_RETURN_ORIGINS`: comma-separated canonical origins.
   Unset or empty means the feature is off. Each entry follows the `PUBLIC_ATTACHMENT_ORIGIN`
   origin rules minus the `'self'` literal (https canonical origin; `http://localhost[:port]` and
   `http://127.0.0.1[:port]` only outside production; no path, query, fragment, credentials,
   wildcards or whitespace). An empty entry, a duplicate or an invalid entry fails config load;
   the message names the variable and never echoes the value. Both variables share one origin
   check.
3. **Delivery.** `GET /me` returns `platform_return_origins: string[]` (always present, `[]` when
   off). The frontend type declares it optional and treats a missing value as `[]`;
   `POST /auth/mock-login` does not return it.
4. **Validation.** A pure frontend function (`lib/router/platform-return.ts`). The search field is
   syntactic: string up to 2048, parses as a URL, protocol `https:` (or `http:` for
   `localhost`/`127.0.0.1`), no username or password; an invalid value is dropped like any other
   search field. The render check requires the URL's `origin` to be exactly one of
   `platform_return_origins`. Otherwise nothing is rendered, no error is shown and nothing
   navigates. The app never navigates automatically.
5. **Affordance.** One placement: the top area of `AppSidebar`, above the nav sections, only when
   the current location carries an allowlisted `platformReturn`. A plain same-tab `<a href>` with
   the `ArrowLeft` icon and the fixed label `플랫폼으로 돌아가기` (`lib/copy/router.ts`).
6. **Persistence.** URL only. In-app navigation that rebuilds search may drop the key; no storage
   and no carry-over logic.

## Not implemented

| Item | Reason | Reopen when |
| --- | --- | --- |
| Carry `platformReturn` across in-app navigation | Needs carry-over logic in every link and navigate call that rebuilds search; the MVP request only needs the link on the arrival page | Platform users report losing the link after navigating |
| Per-link origin menu label | One fixed label keeps copy and the contract small | The platform asks for a menu-specific label |

## Consequences

- Deployments opt in per origin; the default build shows no link.
- Adding a route that should show the link means adding the field to its strict schema.
