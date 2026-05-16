# Audit log storage and immutability

Sensitive Permission grants and uses, Permission Request decisions, Reporter-Facing VOC Status changes, Task Request approvals (including Task Request Self-Approval), workspace settings changes, and Managed System Registry edits must all be **audited** per `docs/implementation/05-permission-policy.md`, `docs/design/04-voc-system.md`, and CONTEXT.md invariants.

## Storage

Audit events live in a single Postgres table inside the same database as the rest of the domain, so the business mutation and its audit row commit in **one transaction**:

```text
core.audit_log
- id              uuid primary key
- workspace_id    uuid not null
- actor_id        uuid not null references core.actors  -- who did it
- event_type      text not null                          -- e.g. 'task_request.approved'
- subject_type    text not null                          -- 'voc' | 'task' | 'permission_request' | ...
- subject_id      uuid not null
- summary         text not null                          -- short human-readable line
- detail          jsonb not null default '{}'::jsonb     -- event-specific payload
- created_at      timestamptz not null default now()
```

External destinations (Loki, ElasticSearch, S3) were rejected for MVP. The audit story requires that **the audit row exists if and only if the business mutation committed**; only a single-database transaction gives that. External shipping can be added later as a downstream consumer that tails this table, without changing the contract.

## Immutability

Append-only is enforced by **database role separation**, not by application code or trigger:

- The application connects as a role with `INSERT, SELECT` only on `core.audit_log`. `UPDATE` and `DELETE` are revoked.
- A separate admin role (used only by migrations and explicit, audited operator scripts) retains `UPDATE`/`DELETE`. Operator scripts that touch this table must themselves emit an audit row identifying the operator and reason.
- Migrations enforce the grant in code so a future schema change cannot silently widen access.

Application-only enforcement was rejected because a careless `db.update(auditLog)` would compile and ship. A trigger-based block was rejected as redundant with the role grant, more surface area to test, and slower to reason about in code review.

## Event model

A single generic table with a `detail jsonb` column rather than per-domain audit tables. The reasoning matches the Entity Link decision (`docs/design/11-entity-linking.md`): the audit surface is polymorphic — `subject_type` can be any domain record — and we need cross-domain queries ("everything Actor X did in the last 7 days", "every Sensitive Permission use this month") that a per-domain split would have to UNION. Common fields stay as columns (`workspace_id`, `actor_id`, `event_type`, `subject_type`, `subject_id`, `summary`, `created_at`); event-specific payload lives in `detail`.

`event_type` values follow `subject_type.verb` naming (`voc.triaged`, `task_request.approved`, `task_request.self_approved`, `permission_request.decided`, `reporter_facing_status.changed`, `managed_system.updated`). The canonical list lives in `packages/shared` as a Zod enum so backend and frontend agree.

## Retention

Indefinite for MVP. The dataset is small and internal; setting a deletion policy without an explicit company-side rule risks anonymising or deleting records that legal or compliance needs to retain. A follow-up ADR will define retention once the company-side data-handling policy is known, at which point retention happens via a scheduled job that moves rows to `core.audit_log_archive` (or deletes them, depending on policy) rather than by mutating live audit rows.

## What this ADR locks

- Audit rows live in the same Postgres database as the business mutation that caused them, committed in one transaction.
- The application role cannot UPDATE or DELETE audit rows; admin-only role is the only mutator and is itself audited.
- One generic `core.audit_log` table, polymorphic by `subject_type`/`subject_id`, JSON detail.
- No automatic deletion or archival in MVP.

## Reopening

Moving to an external audit store, splitting per-domain tables, or introducing automatic retention each warrants a new ADR. Adding new `event_type` values is *not* a reopen — it is the normal way new audited features extend this contract, and the Zod enum in `packages/shared` makes the extension visible at code-review time.
