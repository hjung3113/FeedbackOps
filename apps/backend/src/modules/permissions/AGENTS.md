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
- A new Role Level extends `ROLE_LEVEL_VALUES` in `packages/shared/src/enums/index.ts` and the
  layers in `docs/adr/0048-role-level-extension.md`. `roleSatisfies` in `check-service.ts` is the
  implicit-capability arm; domain modules that compare `role_level` themselves are part of that
  same change.

## Cross-System Rules

- Domain modules call Permission through approved check APIs.
- Permission decisions that affect access must be auditable.

## Verification

- Test allow, deny, explicit deny override, request approval, rejection, expiry, revocation, and safe error payloads when touched.

## Permission close-out contract

- ADR-0066 requester withdrawal/edit/revisions and narrowed approval ship in #1080; selected owner/Admin context and explained risk ship in #1081. Governed direct grants remain implementation pending.
- Centralize capability/scope candidates; reject unsupported object authorization rather than stripping it into a broader grant. Source objects are provenance.
- Approval and direct grant share a Permission-owned grant command; expired reissue preserves history through a new grant ID and proposed superseded_at. Never revive or fake-revoke the predecessor.
- Serialize by recipient through Auth's approved lock seam, then request, workspace policy, grant; requester commands preserve owner/workspace 404 privacy, and Admin authorization precedes replay.
- Use Core-owned audit-question and authorized source-summary projections; requester reads omit risk/deny internals and all UI-facing reads omit email/restricted Survey data.
