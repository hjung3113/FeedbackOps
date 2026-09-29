# Notifications: in-app first, email as an abstracted channel

`docs/design/03-core-platform.md` and `docs/design/13-mvp-roadmap.md` list a Notification system as MVP scope but leave the data model and channel strategy open. This ADR locks both, and the catalogue of who gets notified for which event.

## In-app notifications

Notifications targeted at a specific Actor are persisted:

```text
core.notifications
- id              uuid primary key
- workspace_id    uuid not null
- actor_id        uuid not null references core.actors
- event_type      text not null              -- e.g. 'task_request.assigned_to_me'
- subject_type    text not null
- subject_id      uuid not null
- summary         text not null              -- short user-facing Korean line. ADR-0010's i18next catalog was not built (amended 2026-09-24); this insert-time lookup does not exist.
- detail          jsonb not null default '{}'::jsonb
- created_at      timestamptz not null default now()
- read_at         timestamptz null
- archived_at     timestamptz null
```

The Dashboard surface (CONTEXT.md: "action-queue surface") gains a sibling **Inbox tab** that reads from this table; the Dashboard tab continues to show actionable records inside the Actor's Managed System Permission Scope. The two are distinct surfaces in the same shell:

- **Dashboard / actionable**: what *needs action* in my scope (matches `Dashboard` glossary entry).
- **Dashboard / inbox**: events directed *at me* personally — assignments, replies on my VOC, approvals of my Task Request, permission decisions.

Audit reuse was rejected. `core.audit_log` is append-only and unaudienced; notifications are read/archived per Actor. Conflating them makes the audit table mutable per-Actor (breaking ADR-0008) and makes notification queries scan the entire audit volume.

## Email channel (abstracted)

A `NotificationChannel` interface lives in `apps/backend/src/modules/notifications`:

```text
NotificationChannel
- send(envelope: NotificationEnvelope): Promise<void>
NotificationEnvelope
- workspace_id
- actor_id          // recipient
- event_type
- subject_type
- subject_id
- locale            // ko-KR in MVP per ADR-0010
- summary           // Korean user-facing line. No i18next catalog; see the ADR-0010 amendment.
- body              // optional longer markdown/HTML for email
- in_app            // boolean: also persist a row in core.notifications?
- email             // boolean: also send via email channel?
```

Two implementations swapped by `NOTIFICATION_EMAIL_CHANNEL` env var:

- `MockEmailChannel` — dev and CI. Writes envelopes to stdout (via Pino) so tests can assert on them. Never opens a network socket.
- `SmtpEmailChannel` — staging and production. Uses `nodemailer` against the company SMTP relay. Connection details come from `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`. No third-party API (SendGrid, Postmark, etc.) — we route through the company's existing relay so deliverability and auditing match other internal mail.

The `in_app` boolean is on the envelope so the dispatcher can decide both channels per event_type. In-app is the default; email opt-in is per event_type in the dispatcher catalogue below.

## Dispatcher and trigger catalogue

Dispatch is **code-driven**, not DB-driven. A single `notificationCatalogue` map in `apps/backend/src/modules/notifications/catalogue.ts` declares, per `event_type`:

- recipients resolver (a function: `(event, deps) => Promise<actor_id[]>`)
- `in_app: boolean`
- `email: boolean`
- summary text (Korean). Do not add i18next to produce it; ADR-0010's catalog was not built.

Modules that perform an audited action call `notify(event_type, subject)` from their application service inside the same transaction as the mutation and audit row. The dispatcher enqueues a pg-boss job (ADR-0009) per envelope so SMTP latency cannot block the request handler.

Per-Actor preferences (opt-out per event_type, channel) are **not** in MVP. We accept the risk that a few event types may be noisy; if that becomes a real complaint, a follow-up ADR adds `core.notification_prefs` + UI without changing the dispatcher contract.

DB-driven rules were rejected because they require an Admin UI to configure and an unfamiliar mental model for what is essentially a small fixed table. Adding a rule is a code PR that updates the catalogue. An error code's user-facing copy is `CATALOG` in `errorMapper.ts` (ADR-0012, ADR-0010 amendment), not an i18next file. This notification catalogue itself is not implemented.

## Initial catalogue (MVP)

The following event types are wired in MVP; the dispatcher catalogue file is the source of truth and may add more without re-opening this ADR.

```text
event_type                                 recipients                                                    in_app  email
voc.assigned_to_me                         resolved owner                                                  Y       N
voc.reporter_replied                       current VOC owner + Admins of the Managed System                Y       N
voc.severity_set_high_or_critical          current VOC owner + Admins of the Managed System                Y       Y
task_request.assigned_to_me                resolved reviewer                                               Y       N
task_request.approved                      creator                                                        Y       N
task_request.rejected                      creator                                                        Y       Y
task.assigned_to_me                        new assignee                                                   Y       N
task.released                              VOC owner (if linked) — for Public Update review candidate     Y       N
permission_request.submitted               Admins of the Workspace                                         Y       Y
permission_request.decided                 requester                                                      Y       Y
survey.assigned_to_me                      resolved respondent                                            Y       N
```

## Idempotency and back-pressure

Each pg-boss notification job carries the originating mutation's `correlation_id` and an envelope hash; the job handler `INSERT … ON CONFLICT DO NOTHING` against `(workspace_id, actor_id, event_type, subject_id, correlation_id)` so repeated emits of the same logical event do not double-notify. Per-Actor throttling is not in MVP.

## What this ADR locks

- One in-app notification table (`core.notifications`).
- One channel abstraction (`NotificationChannel`) with mock and SMTP implementations.
- Code-driven dispatcher catalogue; no Admin UI for notification rules.
- No per-Actor preferences in MVP.
- pg-boss is the delivery transport (per ADR-0009).

## Reopening

Adding per-Actor preferences, switching to a third-party transactional email service, introducing a new channel (Slack, Teams, push), or moving to DB-driven dispatch rules each warrants a new ADR.

## Implementation note — Issue #165

At the time Issue #165 shipped, notification delivery remained deferred until the notification-system slice. That slice must emit `task.released` once per newly inserted candidate (not merely per Task transition), target the candidate VOC's current owner, and deduplicate using the release `correlation_id`. The releasing actor, Task assignee, Reporter, and worker actor are not recipients by default.

## Amendment 2026-09-29 (#509)

Issue #509 part 1 narrows the initial catalogue to the ten implemented rows:
`voc.assigned_to_me`, `voc.reporter_replied`,
`voc.severity_set_high_or_critical`, `task_request.approved`,
`task_request.rejected`, `task_request.needs_more_evidence`,
`task.assigned_to_me`, `task.released`, `permission_request.submitted`, and
`permission_request.decided`. It adds
`task_request.needs_more_evidence` (recipient: Task Request creator) and defers
`survey.assigned_to_me` and `task_request.assigned_to_me`, which have no
producer in this slice. No notification row is created for denied self-approval
or permission `needs_more_info` / `permission_denied` outcomes.

Callers resolve recipients in their request transaction and pass Actor IDs to
the dispatcher. "Admins of the Managed System" means all workspace Actors
whose `role_level` is `admin`; a team-owned VOC with no user owner contributes no owner recipient, so
`voc.assigned_to_me` and `task.released` (owner only) enqueue no jobs, while
`voc.reporter_replied` and `voc.severity_set_high_or_critical` still reach the
workspace admins. Self-notification is allowed with no
global suppression. The `task.released` exclusions from the Issue #165 note
remain a caller-side rule; the catalogue documents that policy but does not
resolve recipients.

Email delivery is at-least-once. The handler holds the email claim and inbox
insert in one transaction while calling the channel. If email succeeds but
the transaction fails before commit, retry may deliver the email again.
This slice provides only the Pino-backed `MockEmailChannel`; SMTP remains a
later slice, and selecting `smtp` fails with a clear not-configured error.

Issue #509 part 2b wires the Task Request decision, Task conversion assignment,
and Permission Request submission and decision producers described in the
notifications API contract. `notify()` filters recipients to Actors in the
event workspace before enqueueing.

Issue #509 part 2a wires the VOC owner assignment, reporter reply, and
high-or-critical severity producers, plus `task.released` after a new Public
Update review candidate is inserted, as described in the notifications API
contract.
