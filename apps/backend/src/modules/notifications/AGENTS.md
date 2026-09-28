# Notifications Module Agent Guide

## Ownership

- This module owns the notification catalogue, fan-out dispatch port, delivery
  job, and actor-scoped in-app read model.
- Core owns the notification concept and shared storage contract; this
  directory owns the implementation.
- Notifications are not a second audit log. Audit history remains in
  `core.audit_log` and is never mutated by this module.

## Invariants

- Callers resolve recipient Actor ids in the request transaction and pass
  them to `notify`; this module does not read domain repositories to resolve
  recipients or mutate domain records.
- One pg-boss job is enqueued per recipient in the caller's transaction.
- The Korean summary is rendered by the catalogue and frozen at insertion.
- In-app reads and read/archive mutations are scoped to the session Actor and
  workspace. A row outside either scope is indistinguishable from an absent
  row.
- Application DML may update only `read_at`, `archived_at`, and
  `email_sent_at` on `core.notifications`; there is no hard-delete path.
- The email channel in this slice is Pino-backed `MockEmailChannel` only. It
  never opens a socket; SMTP is a later slice.

## Verification

- Cover transactional enqueue/rollback, handler idempotency and email claim
  rollback, queue boot validation, actor/workspace isolation, and the database
  grant boundary when changing this module.
