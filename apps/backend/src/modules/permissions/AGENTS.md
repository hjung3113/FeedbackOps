# Permissions Module Agent Guide

## Ownership

Permission owns permission requests, permission decisions, explicit deny handling, and access decision read models.
Permission is not a generic shared utility package.

## Invariants

- Explicit Deny overrides general Allow.
- Permission errors must include requestable permission information only when safe.
- Permission-limited content should expose approved summary contracts, not raw restricted data.
- Frontend permission states are display hints only; backend decisions are authoritative.

## Cross-System Rules

- Domain modules call Permission through approved check APIs.
- Permission decisions that affect access must be auditable.

## Verification

- Test allow, deny, explicit deny override, request approval, rejection, expiry, revocation, and safe error payloads when touched.
