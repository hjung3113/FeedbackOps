# Permissions Module Agent Guide

## Ownership

Permission owns permission requests, permission decisions, explicit deny handling, and access decision read models.
Permission is not a generic shared utility package.

## Invariants

- Explicit Deny overrides general Allow.
- Permission errors must include requestable permission information only when safe.
- Permission-limited content should expose approved summary contracts, not raw restricted data.
- Frontend permission states are display hints only; backend decisions are authoritative.
- A display hint must still agree with the route that enforces it. `checkCapability` answers for the
  generic role layer only (`roleSatisfies`); domain modules that layer an admin-role bypass on top
  declare it once in `CAPABILITY_META.adminModuleBypass` (`packages/shared/src/enums/capabilities.ts`),
  and `GET /me/permissions/check` re-applies that declaration via `applyAdminModuleBypass`. Adding or
  moving a module-level bypass without updating that declaration is the issue #372 defect.

## Cross-System Rules

- Domain modules call Permission through approved check APIs.
- Permission decisions that affect access must be auditable.

## Verification

- Test allow, deny, explicit deny override, request approval, rejection, expiry, revocation, and safe error payloads when touched.
