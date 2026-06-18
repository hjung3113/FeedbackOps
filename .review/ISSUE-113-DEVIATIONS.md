# Issue #113 — Deviations

## D1 · 409 envelope uses existing `conflict.stale_write`

**Prompt directive:** "If link status != 'active' → 409 (already detached/revoked) OR idempotent 200 returning current state — pick 409 and document in DEVIATIONS if you prefer; default to 409 `conflict`."

**Actual change:** Already-detached and lost-race detach attempts return HTTP 409 with code `conflict.stale_write`.

**Reason:** `packages/shared/src/errors/codes.ts` does not define a generic `conflict` code, and that file is outside the Issue #113 allowed touch set. Using an unknown `conflict` string would be remapped by the global error handler to a generic 500. `conflict.stale_write` is an existing 409-class code and preserves the requested HTTP status without widening the touch set.
