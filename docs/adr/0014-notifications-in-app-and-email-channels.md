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
- summary         text not null              -- short user-facing line, Korean (per ADR-0010 catalog lookup at insert time)
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
- summary           // rendered string from the i18next catalog
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
- summary catalogue key (resolved through ADR-0010 i18n catalog)

Modules that perform an audited action call `notify(event_type, subject)` from their application service inside the same transaction as the mutation and audit row. The dispatcher enqueues a pg-boss job (ADR-0009) per envelope so SMTP latency cannot block the request handler.

Per-Actor preferences (opt-out per event_type, channel) are **not** in MVP. We accept the risk that a few event types may be noisy; if that becomes a real complaint, a follow-up ADR adds `core.notification_prefs` + UI without changing the dispatcher contract.

DB-driven rules were rejected because they require an Admin UI to configure and an unfamiliar mental model for what is essentially a small fixed table. Adding a rule today is a code PR that updates the catalogue and the i18n catalog together — same as adding an error code under ADR-0012.

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

Issue #165 creates the durable review candidate only; notification delivery remains deferred until the notification-system slice exists. That slice must emit `task.released` once per newly inserted candidate (not merely per Task transition), target the candidate VOC's current owner, and deduplicate using the release `correlation_id`. The releasing actor, Task assignee, Reporter, and worker actor are not recipients by default.
