# RESEARCH-1 — Notification Rule (pre-issue)

Date: 2026-09-26. Read-only survey. Nothing in `apps/` or `docs/` was edited.

The roadmap item is named "Notification Rule" (`docs/design/13-mvp-roadmap.md`, Phase 1). ADR-0014 already rejected a rules engine. This note does not reopen that decision. The slice to build is the code-driven catalogue ADR-0014 locked, not user-configurable rules.

ADR-0014's own "MVP" means the first cut of this slice (in-app + abstracted email, no preferences). It does not mean the work already belonged in the shipped product MVP. Phase 1 placement and the ADR agree.

## 1. What ADR-0014 actually locks

Source: `docs/adr/0014-notifications-in-app-and-email-channels.md` (Korean-summary amendment dated 2026-09-24 in the file). Related and still binding: ADR-0009 (pg-boss), ADR-0015 (the inbox index), ADR-0010 (no i18next). Issue #165's implementation note at the bottom of ADR-0014 is also binding for `task.released`.

### In-app store

One table, `core.notifications`, one row per recipient Actor. Columns the ADR lists:

```text
id, workspace_id, actor_id → core.actors,
event_type, subject_type, subject_id,
summary,          -- Korean line written at insert; no i18next lookup
detail jsonb default '{}',
created_at, read_at null, archived_at null
```

Load-bearing rejection of audit reuse:

> Audit reuse was rejected. `core.audit_log` is append-only and unaudienced; notifications are read/archived per Actor. Conflating them makes the audit table mutable per-Actor (breaking ADR-0008) and makes notification queries scan the entire audit volume.

ADR-0015 separately locks the read index: `(workspace_id, actor_id, read_at, created_at desc)`.

### Channels

A `NotificationChannel` with `send(envelope)` lives in `apps/backend/src/modules/notifications`. The envelope carries `workspace_id`, `actor_id`, `event_type`, `subject_type`, `subject_id`, `locale` (`ko-KR`), `summary`, optional `body`, and two booleans: `in_app`, `email`.

Swapped by `NOTIFICATION_EMAIL_CHANNEL`:

- `MockEmailChannel` — dev and CI. Pino only. Never opens a socket.
- `SmtpEmailChannel` — staging and production. `nodemailer` against the company SMTP relay. Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`. No SendGrid, Postmark, or other third-party API.

In-app is the default. Email is opt-in per catalogue row, not per Actor.

### Dispatcher

> Dispatch is **code-driven**, not DB-driven. A single `notificationCatalogue` map in `apps/backend/src/modules/notifications/catalogue.ts` declares, per `event_type`: recipients resolver `(event, deps) => Promise<actor_id[]>`, `in_app`, `email`, and Korean summary text.

Call shape:

> Modules that perform an audited action call `notify(event_type, subject)` from their application service inside the same transaction as the mutation and audit row. The dispatcher enqueues a pg-boss job (ADR-0009) per envelope so SMTP latency cannot block the request handler.

Explicitly not in this slice:

> Per-Actor preferences (opt-out per event_type, channel) are **not** in MVP. … a follow-up ADR adds `core.notification_prefs` + UI without changing the dispatcher contract.

> DB-driven rules were rejected because they require an Admin UI to configure and an unfamiliar mental model for what is essentially a small fixed table. Adding a rule is a code PR that updates the catalogue.

Reopening (new ADR required): per-Actor preferences, a third-party transactional email vendor, a new channel (Slack, Teams, push), or moving to DB-driven rules.

ADR-0010 says a backend that writes user-facing Korean at insert time needs its own ADR, and that i18next must not be added to produce the line. ADR-0014 is that decision: the catalogue string is stored as `summary` at insert time. Do not build an i18next catalog for this.

### Catalogue (the whole event list)

The catalogue file may add rows later without reopening the ADR. The locked initial set:

| `event_type` | Recipients | in-app | email |
| --- | --- | --- | --- |
| `voc.assigned_to_me` | resolved owner | Y | N |
| `voc.reporter_replied` | current VOC owner + Admins of the Managed System | Y | N |
| `voc.severity_set_high_or_critical` | current VOC owner + Admins of the Managed System | Y | Y |
| `task_request.assigned_to_me` | resolved reviewer | Y | N |
| `task_request.approved` | creator | Y | N |
| `task_request.rejected` | creator | Y | Y |
| `task.assigned_to_me` | new assignee | Y | N |
| `task.released` | VOC owner if linked — Public Update review candidate | Y | N |
| `permission_request.submitted` | Admins of the Workspace | Y | Y |
| `permission_request.decided` | requester | Y | Y |
| `survey.assigned_to_me` | resolved respondent | Y | N |

`task.released` is narrowed by the Issue #165 note:

> That slice must emit `task.released` once per newly inserted candidate (not merely per Task transition), target the candidate VOC's current owner, and deduplicate using the release `correlation_id`. The releasing actor, Task assignee, Reporter, and worker actor are not recipients by default.

### Idempotency

> Each pg-boss notification job carries the originating mutation's `correlation_id` and an envelope hash; the job handler `INSERT … ON CONFLICT DO NOTHING` against `(workspace_id, actor_id, event_type, subject_id, correlation_id)` so repeated emits of the same logical event do not double-notify. Per-Actor throttling is not in MVP.

Job retry defaults stay ADR-0009: `retryLimit: 5`, `retryDelay: 30`, `retryBackoff: true`. Failed jobs stay in pg-boss's failed state. ADR-0009's daily Admin probe of failed jobs is a separate, already-specified mechanism — this slice should not invent a second dead-letter UI.

### Surface the ADR names

Dashboard (the action-queue surface) gains a sibling **Inbox** tab. The two are different:

- Dashboard / actionable — what needs action in the Actor's Managed System Permission Scope.
- Dashboard / inbox — events directed at that Actor (assignments, replies on their VOC, approvals of their Task Request, permission decisions).

## 2. Implementation check — nothing is built

There is no `apps/backend/src/modules/notifications/`. `core.notifications` is not in `apps/backend/src/db/schema/`. No notification route is registered. `nodemailer`, `NOTIFICATION_EMAIL_CHANNEL`, and `SMTP_HOST` appear only in ADR-0014. No `notificationCatalogue`.

Searched `apps/` for `notif` (case-insensitive). Hits that are not this system:

- `apps/frontend/src/lib/layout/AppRail.tsx` lines 112–118: a Bell button, `aria-label="Notifications"`, no `onClick` and no route. It is outside `features/`. The prototype copy is `docs/design-prototype/shell.jsx` line 248: `<button className="rail-item" title="Notifications">` with no handler and no popover.
- `apps/frontend/src/features/voc/components/create/AttachmentDropzone.tsx`, `VocCreateScreen.tsx`, and `components/detail/ComposerSection.tsx`: comments that say "notify parent" about dirty/upload state.
- `apps/backend/src/modules/voc/__tests__/public-update-review-candidates.integration.test.ts`: fixture text `Reviewer chose not to notify.`

`apps/backend/src/modules/` has no notification module, stub route, or table. `apps/frontend/src/features/` has no notification feature, inbox component, or route. `features/voc/routes/InboxRoute.tsx` and `features/home` "Inbox" labels are the VOC list and recent-item chrome, not this table.

`docs/implementation/` has no notification API contract. `docs/implementation/02-domain-module-boundaries.md` does not list the module. `docs/design/03-core-platform.md` only names Notification as a core concept. `docs/frontend/specs/voc.md` still says the VOC kebab Subscribe action is "TBD (notifications, ADR-0014)" — that control is not in the catalogue and should not be built under this slice.

## 3. Do not subscribe to the audit vocabulary

`packages/shared/src/enums/audit-events.ts` is a registry. Domain modules under `packages/shared/src/audit/` own the strings. The header locks the style: snake_case, a single token, no dot (`permission_requested`, `voc_owner_assigned`). New audit events must be added to the owning tuple plus a Zod detail schema. Both apps import `AUDIT_EVENT_TYPES` / `auditEventTypeSchema` / `AUDIT_EVENT_DETAIL_SCHEMAS` from `@fops/shared`.

The notification catalogue is a different language: dotted, audience-shaped (`voc.assigned_to_me`, `task_request.approved`). Overlap with audit verbs is partial and lossy:

| Catalogue event | Nearest audit verb | Why they are not the same event |
| --- | --- | --- |
| `voc.assigned_to_me` | `voc_owner_assigned` | Fires for the new owner only. VOC owner is `owner_user_id` **or** `owner_team_id` (`vocs_owner_xor` in `apps/backend/src/db/schema/voc.ts`). A team owner has no Actor. |
| `voc.reporter_replied` | `reporter_reply_created` | Different name. Recipients are owner + admins, not the audit actor. |
| `voc.severity_set_high_or_critical` | `voc_severity_set` | Audit fires for every severity. Notification fires only for `high` or `critical` (`voc.vocs.severity` check: `low`, `medium`, `high`, `critical`). |
| `task_request.assigned_to_me` | none | No producer. `reviewer_actor_id` is nullable and is written only in `updateTaskRequestDecision` (`task-requests/repo.ts`) at decision time, to the deciding actor (`task-requests/service.ts` passes `reviewerActorId: args.actor.actor_id`). There is no pre-decision reviewer assignment and no assignment verb in `TASK_REQUEST_AUDIT_EVENT_TYPES`. Same situation as `survey.assigned_to_me`. |
| `task_request.approved` / `.rejected` | `task_request_approved` / `task_request_rejected` | Same fact, different string. Creator is `requester_actor_id`, not "the audit actor". |
| `task.assigned_to_me` | none | Assignee is `task.tasks.assignee_actor_id`, written only when `convertTaskRequest` inserts the Task (`tasks/service.ts`). The service returns `getTask`, `getTaskComments`, `createTaskComment`, `convertTaskRequest`, `linkExistingTask`, `patchTaskStatus`, `listTasks` — no reassignment method, so "changed" has no call site. Task audit verbs are only `task_status_changed` and `task_comment_created`. |
| `task.released` | `task_status_changed` to `released`, then `public_update_review_candidate_created` | Must **not** fire on the status transition. One notification per newly inserted candidate, keyed by the release `correlation_id`. |
| `permission_request.submitted` | `permission_requested` | Recipients are workspace Admins, not the requester. |
| `permission_request.decided` | `permission_approved` / `permission_rejected` | One catalogue row covers two audit verbs. See the open question on `needs_more_info` / `permission_denied`. |
| `survey.assigned_to_me` | none | No assignment column. `survey.surveys` has `operator_actor_id` only. `respondent_actor_id` exists on `survey_responses` after submit. |

Recommendation: keep the catalogue strings. Do not add them to `AUDIT_EVENT_TYPES`. Do not poll or listen to `core.audit_log`. The producer calls `notify(...)` in the same transaction as `auditService.record(...)`, the way `apps/backend/src/modules/tasks/service.ts` already enqueues `tasks.create_public_update_review_candidates` via `boss.send(..., { db: fromDrizzle(tx, sql) })` beside the audit write (around lines 838–876).

Resolve recipients in that request transaction and put the actor ids on the job payload. Resolving later in the worker would notify whoever owns the record at delivery time, which is not "the owner this action assigned."

The existing release job is the right neighbor for `task.released`, not the status patch. `released-review-candidates.ts` runs `createForReleasedTask`. The notification enqueue belongs there, after a candidate row is actually inserted, once per new candidate. The status patch's audit event stays `task_status_changed`.

## 4. Email delivery uses the pg-boss this repo already runs

ADR-0009, amended 2026-07-13:

- One runner, pg-boss, schema `pgboss`, same Postgres. No Redis, no Temporal, no in-process `setInterval`.
- Workers stay inside `apps/backend`. Boot in `apps/backend/src/index.ts`: Drizzle pool → `initBoss` → `registerCoreJobs` / `registerVocJobs` → Fastify listen.
- A module registers from `apps/backend/src/modules/<module>/jobs/index.ts` as `register<Module>Jobs(boss, deps)`. There is no top-level cron file.
- Handlers are idempotent. Payloads carry `correlation_id`. Audited mutations done *by* a job write `core.audit_log` in the same transaction. Notification delivery is not itself an audited domain mutation; the originating service already wrote the audit row.
- Retry 5 / 30s / exponential backoff. Failed jobs are not deleted.

Concrete constraints already in the tree:

- `apps/backend/src/lib/jobs.ts`: `migrate: false`, `createSchema: false`. `fops_app` must not DDL the pg-boss schema.
- Queues are pre-inserted by Drizzle migrations. Boot throws if `boss.getQueues([name])` is empty (`released-review-candidates.ts`). The sibling for `core.notifications` is not `0004_rate_limits_purge_queue.sql` — that file only inserts a queue row. Copy `0032_task_released_review_candidates.sql`: new table, `GRANT SELECT, INSERT … TO fops_app`, and `INSERT INTO pgboss.queue (...) ON CONFLICT DO NOTHING` with `retry_limit=5`, `retry_delay=30`, `retry_backoff=true`, in one migration. Copy `0033_public_update_review_candidate_update_grant.sql` for the column-scoped `GRANT UPDATE` that follows. Grants are spelled out in §5.2.
- Request-path enqueue that must commit or roll back with the mutation uses `fromDrizzle(tx, sql)` — only `tasks/service.ts` does this today. Embedding enqueue deliberately does not. Notification enqueue must follow the task path, or a rolled-back mutation still delivers mail.
- `core.actors.email` exists and is unique per workspace. That is the SMTP recipient address. No new address book.

Yes: email delivery is a pg-boss job. In-app insert is the same job, not a synchronous write on the request, because the ADR puts `INSERT … ON CONFLICT` in the job handler.

Suggested queue name, matching existing dotted names (`core.rate_limits_purge`, `tasks.create_public_update_review_candidates`): `notifications.dispatch`. One job per envelope.

`email_sent_at` is not in the ADR column list. The in-app row is inserted with `ON CONFLICT DO NOTHING`, so a retry must not treat "row exists" as "mail already sent." One mechanism, not two: inside the delivery transaction, `UPDATE … SET email_sent_at = now() WHERE id = ? AND email_sent_at IS NULL`; if this worker won the claim, call SMTP (or the mock) **while that transaction is still open**; commit only after the send returns; roll the claim back if the send throws. A thrown send leaves `email_sent_at` null, so the pg-boss retry sends again. A crash after the SMTP server has accepted the message and before commit also rolls back, so the retry can send a second copy. That is at-least-once. It is not "set the timestamp only after SMTP succeeds" outside the transaction (a crash between send and update double-sends too, and it disagrees with the claim), and it is not "commit the claim, then send" (a thrown send then skips the mail forever). In-app-only rows leave `email_sent_at` null and do not send. Do not add a delivery-log table; pg-boss's failed state is the failure record. Whether at-least-once is acceptable is open question 8, because a duplicate can be a second rejection email. Do not implement both guarantees.

## 5. Rough implementation design

### 5.1 Backend module

Match a small module that already has routes + service + repo (`dashboard`, `entity-links`), plus the jobs directory ADR-0009 now requires. There is no `dto.ts` anywhere under `apps/backend/src/modules/`. Do not invent one. Zod schemas live next to the route or in `@fops/shared` if the frontend needs the response type. `permissions/` is a weaker template: it has no `repo.ts`.

```text
apps/backend/src/modules/notifications/
  AGENTS.md            # ownership: catalogue, fan-out, in-app read model. Not a second audit log.
  CLAUDE.md            # pointer stub, same as sibling modules
  index.ts             # createNotificationService, routes, registerNotificationJobs re-exports
  catalogue.ts         # notificationCatalogue — the only rule list
  dispatcher.ts        # notify(event_type, subject, ctx) → resolve → dispatcher port per envelope
  port.ts              # NotificationDispatcher. Production impl calls boss.send. Tests get a recording or no-op fake.
  channels.ts          # NotificationChannel port + MockEmailChannel. No nodemailer import.
  smtp.ts              # SmtpEmailChannel only. Added in sub-scope 3, behind the env switch.
  channel-factory.ts   # NOTIFICATION_EMAIL_CHANNEL. Same split as lib/storage/factory.ts and voc/embedding/factory.ts.
  repo.ts              # insert-on-conflict, list, mark read, archive
  service.ts           # actor-scoped reads and read/archive commands
  routes.ts
  jobs/index.ts        # registerNotificationJobs(boss, deps)
  jobs/dispatch.ts     # queue name, handler, pre-created-queue check
  __tests__/           # integration: enqueue rolls back with the tx; conflict does not double-insert
```

Schema columns go in `apps/backend/src/db/schema/core.ts` (`coreSchema`). Not a new Postgres schema. The implementing chunk also registers the migration in the Drizzle journal (existing rule) and adds the module to `docs/implementation/02-domain-module-boundaries.md` under Core. ADR-0014 already placed the code in `modules/notifications` rather than `modules/core`; boundaries doc should say Core owns the concept, this directory owns the code. Same split as Audit Log (`modules/core/audit`) is unnecessary — follow the ADR path.

Wiring:

- `apps/backend/src/index.ts`: `registerNotificationJobs` next to `registerVocJobs`, after pg-boss start, before `listen`.
- `apps/backend/src/server.ts`: `app.register(notificationRoutes, …)` next to `dashboardRoutes`, with `sessionService`, `workspaceId`, and the service. `buildServer`'s `boss` is optional (`BuildServerOptions.boss?`, so tests that do not need jobs can omit it). 77 test files call `buildServer(`. Do not add a hard `deps.boss` to the VOC, task-request, or permission services. `tasks/service.ts` already throws when `boss` is missing on release; that pattern does not scale to every audited mutation. Inject a `NotificationDispatcher` port the way `embeddingEnqueuer` is injected: `server.ts` builds `createVocEmbeddingEnqueuer({ ...(boss ? { boss } : {}), … })` and passes the object in. Production passes the pg-boss implementation (`boss.send` with `fromDrizzle(tx, sql)`). Tests pass a recording or no-op fake and do not start pg-boss. `notify()` calls the port. The port is sub-scope 1. Sub-scope 2 only calls it.
- The release worker is not constructed in `buildServer`. `index.ts` builds `createPublicUpdateReviewCandidatesService({ db, auditService })` with no `boss` and no dispatcher. Emitting `task.released` from `createForReleasedTask` means passing the same port into that factory in `index.ts`, and into the worker's test harness. The plumbing is sub-scope 2a. The port it plugs into is sub-scope 1.
- Domain services call `notify`. The notification module must not import VOC/Task repositories to perform their mutations. Recipient resolvers may read owner/reviewer/admin through a narrow port the caller passes in, or the caller passes already-resolved `actor_id[]`. Prefer the caller passing resolved ids if a resolver would otherwise reach into another module's tables. The catalogue still owns *who* (the policy); the caller owns *the ids it just wrote*.

`event_type` on `notify` is `keyof typeof notificationCatalogue`: a typo is a compile error. A runtime value that is not one of those keys throws. There is no no-op for a missing catalogue row. Nothing legitimate calls `notify` for an event the catalogue does not list, and a silent drop would look like success.

### 5.2 DB sketch

`core.notifications` — ADR columns plus the two fields the idempotency sections require. Not a full migration.

```text
id                  uuid pk
workspace_id        uuid not null  fk → core.workspaces
actor_id            uuid not null  fk → core.actors
event_type          text not null          -- catalogue string, no CHECK (new rows must not need a migration)
subject_type        text not null          -- polymorphic; no fk
subject_id          uuid not null
summary             text not null          -- Korean, frozen at insert
detail              jsonb not null default '{}'
correlation_id      uuid not null          -- ADR conflict key; same type as public_update_review_candidates.correlation_id (0032). Not text.
email_sent_at       timestamptz null       -- null = not sent. Claimed inside the delivery transaction held open across SMTP; rolled back if send throws (§4)
created_at          timestamptz not null default now()
read_at             timestamptz null
archived_at         timestamptz null

unique (workspace_id, actor_id, event_type, subject_id, correlation_id)
index  (workspace_id, actor_id, read_at, created_at desc)   -- ADR-0015
```

Grants go in that migration, matching `0032` (table + `GRANT SELECT, INSERT ON … TO fops_app`) and `0033` (a later column-scoped `GRANT UPDATE`). `0004` is the wrong sibling: it never creates a table and never grants.

```text
GRANT SELECT, INSERT ON core.notifications TO fops_app;
GRANT UPDATE (read_at, archived_at, email_sent_at)
  ON core.notifications TO fops_app;
```

No `DELETE`. No `UPDATE` on `summary`, `detail`, `event_type`, `subject_type`, `subject_id`, `correlation_id`, `actor_id`, `workspace_id`, or `created_at`. Column-scoped `UPDATE` is how this repo keeps the frozen Korean line and the identity columns immutable at the database, not only in the route. Sub-scope 1 tests that `fops_app` cannot `UPDATE summary` and cannot `DELETE`.

No `core.notification_rules`. No `core.notification_prefs`. No delivery-log table. `subject_id` stays a polymorphic uuid (same pattern as audit). Envelope hash stays on the pg-boss payload (singleton key / dedupe), not a column, unless a later implementation finds the unique key insufficient.

`correlation_id` is a `uuid`, not `text`. Every current source is already a uuid: `requireIdempotencyKey` accepts only a UUIDv4 (`lib/http-headers.ts`), `tasks/service.ts` sets the release payload's `correlation_id` to `args.idempotencyKey`, `release_event_id` is `randomUUID()`, and `voc.public_update_review_candidates.correlation_id` is `uuid NOT NULL` (`0032`). Match that column. Current mutating routes that would call `notify` go through `requireIdempotencyKey`, which throws `validation.failed` when the header is absent. ADR-0015's "optional" wording is not what those routes do, so an "otherwise mint a uuid" branch is dead on them. The release worker is not an HTTP route; it reuses the releasing mutation's key. A job retry keeps the same id. A second user action presents a new key, so it still notifies.

For `task.released`, `subject_id` is the new review-candidate id, not the Task id. That is what makes "once per inserted candidate" true under the unique key. `correlation_id` is the release correlation id. `detail` can carry `voc_id` and `task_id` for the link.

### 5.3 API sketch

Session-scoped, same guards as `GET /dashboard/summary`: `requireSession` + `requireWorkspace`. No capability check beyond "this row's `actor_id` is the session actor." A miss is `not_found.record`, not `permission.denied`, so one Actor cannot probe another's ids. No admin list-all endpoint — cross-actor history stays `core.audit_log`.

No rule-config routes. Adding a rule is a catalogue PR.

Reads send `cache-control: private, no-cache`. `POST /notifications/:id/read` and `POST /notifications/:id/archive` do not take `Idempotency-Key`. Both are naturally idempotent: read sets `read_at` only when it is null and an already-read call returns the same row; archive sets `archived_at` and a repeat returns the same row. Requiring the header would copy `requireIdempotencyKey` onto routes that do not need it, and treating the header as optional would follow ADR-0015's wording rather than the code (current mutating routes throw `validation.failed` when the header is missing). Validation failures on the query and the path use `validation.failed`.

`GET /notifications`

Query: `unread` optional boolean, `include_archived` optional boolean default false, `limit` integer 1..100 default 50, `cursor` opaque (same `{ createdAt, id }` idea as Finding comments in `docs/implementation/api/findings.md`).

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "event_type": "task_request.approved",
      "subject_type": "task_request",
      "subject_id": "uuid",
      "summary": "한국어 한 줄",
      "detail": {},
      "created_at": "timestamptz",
      "read_at": null,
      "archived_at": null
    }
  ],
  "page": { "cursor": "optional", "has_more": true },
  "unread_count": 0
}
```

`unread_count` is the badge number for the current Actor in this workspace, ignoring the page window. Cheap enough to return with the list; a separate count route is unnecessary until something polls harder than the inbox.

`POST /notifications/:id/read` — empty body. Sets `read_at` if null. Already-read returns the same row (200). Does not clear `archived_at`.

`POST /notifications/:id/archive` — sets `archived_at`. Does not imply unread. Archived rows disappear from the default list.

Both return the item. Neither deletes. There is no update-summary and no create-from-client endpoint. Clients do not post notifications.

`subject_type` values to standardize in the catalogue: `voc`, `task_request`, `task`, `permission_request`, `public_update_review_candidate`. Not `survey` until that event has a producer.

### 5.4 Frontend sketch

Route ownership in root `AGENTS.md` is `home`, `my-work`, `voc`, `findings`, `voc-cluster`, `surveys`, `tasks`, `integration`, `admin`. Do not add `features/notifications/` and do not add a rail domain. The ADR puts this on the Dashboard shell, which shipped as Home.

| Piece | Where | What |
| --- | --- | --- |
| Inbox tab | `apps/frontend/src/features/home/` (a sibling of `HomeScreen.tsx`, still `PageShell`) | List of `summary` lines, relative time, unread state, row click-through, mark read, archive. Not a chart and not an action queue. |
| Data | `apps/frontend/src/lib/api` + a `useNotifications` hook under `features/home/` | Typed client for the three endpoints. Screens do not enforce permissions; the API does. |
| Sidebar entry | `apps/frontend/src/features/home/homeNavigation.tsx` | One Inbox item beside Home. Home's current sidebar is action queues plus placeholder recents. |
| Bell | `apps/frontend/src/lib/layout/AppRail.tsx` 112–118, rendered for every domain from `AppFrame` | Keep the prototype button. Point it at the Home inbox: `/` (Home owns `/`, `features/home/AGENTS.md`; there is no `/home` route) with whatever search key the tab uses. Home is ADR-0014's Dashboard: it is the action-queue surface (`HomeScreen.tsx` reads `dashboard-summary`; `CONTEXT.md` defines Dashboard as that queue). `/integration` is labelled "Action dashboard" in `routes/_authed.tsx` and is a different surface — do not hang the inbox there. Do not build a dropdown the prototype does not have. Optional unread dot from `unread_count`. |
| Shell | none new | ADR-0020: `PageShell` / `ListShell` / `WorkbenchShell` only. Home is already `PageShell`. A tab pair inside it is the sibling the ADR describes. |

Do not attach this to `features/voc/routes/InboxRoute.tsx` or the Tasks inbox view. Those are record lists. `docs/design-prototype/` has no notification-list screen (`shell.jsx` only draws the dead bell; `screen-tasks-views.jsx` "Inbox" is synthesized task activity). Copy and density for the list are not specified. See open question 1.

Row click uses `subject_type` + `subject_id` + `detail` to the existing screen (`/vocs`, `/tasks`, task requests, admin permission requests, the public-update review surface). Exact query params should be copied from `docs/frontend/routes-and-layout.md` at implementation time, not invented here.

Shared package: the Korean line is already on the row. The frontend does not need the catalogue map. Do not put notification event types into `AUDIT_EVENT_TYPES`.

### 5.5 Sub-scopes

Five issues. Each is shippable alone. 2a and 2b are split because each has its own recipient decisions and its own test-harness blast radius. Do not start 2a or 2b until 1's `notify()` port and conflict key exist. 2b can start before 2a's recipient decisions land. 4 can follow 1 without 3.

1. **Foundation — store, catalogue, dispatch port, in-app read API.** Table, journaled migration (including the §5.2 grants), pre-created `notifications.dispatch` queue, `registerNotificationJobs`, `MockEmailChannel` only (Pino, no socket), the `NotificationDispatcher` port with a pg-boss implementation and a recording/no-op fake, `notify()` from a test (no domain call sites yet), `GET` + mark read + archive, module `AGENTS.md`, `docs/implementation/api/notifications.md`, boundaries-doc row. A DB-level test that `fops_app` cannot `UPDATE summary` and cannot `DELETE`. Email flags in the catalogue are recorded but SMTP is not wired. `event_type` is the catalogue key union. Survey row is omitted until open question 4 is answered. `task_request.assigned_to_me` is omitted until open question 6 is answered.

2a. **VOC call sites + the release worker.** Beside the existing audit write, same transaction, enqueue through the dispatcher port (`fromDrizzle` lives inside the pg-boss implementation, not in the caller).
   - VOC: owner assigned to a user, reporter reply, severity set to `high` or `critical`.
   - `task.released`: inside `createForReleasedTask`, once per inserted candidate, not in the status patch. `index.ts` today builds `createPublicUpdateReviewCandidatesService({ db, auditService })` with no dispatcher; pass the port in there and in the worker's test harness.
   Blocked by open questions 2 and 3. Test-harness blast radius is the VOC suites and the review-candidate worker tests, not tasks or permissions.

2b. **Task, Task Request, and Permission call sites.** Same enqueue rule as 2a. Not blocked by questions 2 or 3.
   - Task: `assignee_actor_id` set at conversion (`convertTaskRequest` only). Not "set or changed". No reassignment endpoint exists.
   - Task Request: `approved` and `rejected` only. Creator = `requester_actor_id`. Do not wire `task_request.assigned_to_me` (open question 6 — no producer). Do not wire `needs_more_evidence` or `task_request_self_approval_denied` until open question 7.
   - Permission Request: submitted, decided (which outcomes count is open question 5).
   Blocked by open questions 5 and 7. Test-harness blast radius is the tasks, task-requests, and permissions integration suites. Self-notification is open question 9: do not add a global "never notify the actor who clicked" rule in this issue. ADR-0014 already excludes specific actors for `task.released` only; that exclusion stays.

3. **SMTP channel.** `nodemailer` dependency, `SmtpEmailChannel` in its own file (`smtp.ts`) behind `channel-factory.ts`, so importing the module does not import `nodemailer`. Env vars from the ADR, `NOTIFICATION_EMAIL_CHANNEL=mock|smtp` defaulting to `mock` so CI cannot send. Only the four `email: Y` rows send: `voc.severity_set_high_or_critical`, `task_request.rejected`, `permission_request.submitted`, `permission_request.decided`. Body can be the same Korean `summary` until someone specifies a longer template. `email_sent_at` uses the held-open claim in §4. Do not ship this issue until open question 8 picks the delivery guarantee.

4. **Home inbox tab + bell link.** After open question 1 (copy and layout). List, mark read, archive, click-through, bell navigates to the tab on `/`. No preferences screen. No Subscribe item on the VOC kebab.

## 6. Decisions ADR-0014 did not settle

These block implementation of the piece named. Everything in §1 is settled and should be treated as given.

1. **Inbox visual and the Korean lines — blocks sub-scope 4, not 1, 2a, 2b, or 3.** No `screen-*.jsx` shows this list. Prototype-is-the-spec says a UI chunk that did not read a prototype screen is rejected, and user-facing copy falls through to a silent prototype, silent frontend spec, and silent `CONTEXT.md`. ADR-0014 only locks the information architecture (sibling tab of the action queue, in the same shell) and that `summary` is a short Korean line. It does not lock layout, density, or the ten strings. Need either a throwaway prototype screen or an explicit user OK for the tab layout, plus approval of the Korean summaries that will be frozen into rows. Until then, sub-scope 1 can store a summary the catalogue owns, but the strings should be reviewed before they are inserted in production, because they are not translated later.

2. **"Admins of the Managed System" — blocks recipient resolution for `voc.reporter_replied` and `voc.severity_set_high_or_critical`.** `CONTEXT.md` locks "Admin is workspace-level in MVP." Role levels are `admin` | `developer` | `user` on `core.actors`. There is no Managed-System Admin role. The ADR uses that phrase for two VOC events and a different phrase, "Admins of the Workspace," for `permission_request.submitted`. Those sets cannot be implemented as written without inventing a role. Pick one before sub-scope 2a wires VOC:
   - **A (recommended, no new role):** both phrases mean workspace Actors with `role_level = admin`. The "Managed System" wording does not narrow the set. Simple, matches CONTEXT, slightly noisier.
   - **B:** workspace Admins plus Developers who hold a grant on that VOC's Primary Managed System. Matches how triage authority actually works, but it notifies people the ADR called Admins and who are not Admins.
   - **C:** reopen ADR-0014 if a real per-system admin audience is wanted.
   Do not pick B or C inside the implementation PR.

3. **Team-owned VOC — small, but the owner column allows it.** `owner_user_id` and `owner_team_id` are mutually exclusive. `core.teams` is still an ADR-0018 placeholder: schema and FK only, no members, no CRUD. Recommended default, confirm before sub-scope 2a: notify `owner_user_id` when it is set; when only a team is set, the recipient list is empty (no fan-out, no error). Building team membership is out of scope.

4. **`survey.assigned_to_me` has no producer — drop it from the first catalogue PR.** Design text says a basic User can answer an assigned Survey (`docs/design/07-survey-system.md`), but the table has an operator, not an assignee list, and a respondent id appears only after submit. Shipping the catalogue row would be dead code. Leave it out until a real assignment write exists. That does not require reopening the ADR; the ADR says the catalogue file may add rows later.

5. **Which permission outcomes count as `permission_request.decided`.** Audit verbs are `permission_approved`, `permission_rejected`, `permission_needs_more_info`, and `permission_denied` (the last is the self-approval denial, which does not change the pending request). Recommended: approved and rejected only. `needs_more_info` is not a decision; `permission_denied` in the self-approval path is not a decision either. Confirm before sub-scope 2b, because those two are easy to wire by mistake and they are `email: Y` if someone folds them into `decided`.

6. **`task_request.assigned_to_me` has no producer — drop it from the first catalogue PR, same treatment as question 4.** `reviewer_actor_id` is nullable and is written only at decision time, to the actor who decided (`updateTaskRequestDecision` in `task-requests/repo.ts`, called from `task-requests/service.ts` with `reviewerActorId: args.actor.actor_id`). There is no pre-decision assignment, so "resolved reviewer" has nothing to resolve. Recommended: omit the row until a real assignment write exists. The ADR says the catalogue file may add rows later; omitting this one does not reopen ADR-0014. The other reading — "reviewer" means every Actor who holds `task_request.review` on the Primary Managed System — is a new recipient policy, not wiring, and it changes who the ADR's "resolved reviewer" line names. That reading needs its own decision, and an ADR amendment if the audience is no longer one resolved reviewer. Do not pick it inside sub-scope 2b.

7. **Which Task Request outcomes notify, besides `approved` and `rejected` — blocks sub-scope 2b.** Same shape as question 5. `TASK_REQUEST_AUDIT_EVENT_TYPES` includes `task_request_needs_more_evidence` and `task_request_self_approval_denied` (`packages/shared/src/audit/task-request.ts`). The catalogue has no row for either. `needs_more_evidence` asks the creator for more evidence; someone wiring `approved` / `rejected` will face it, and it is arguably more notify-worthy than `approved`. `task_request_self_approval_denied` does not change the pending request (the service records the audit and throws before `updateTaskRequestDecision`). Recommended: do not fold either into `approved` or `rejected`. If `needs_more_evidence` should notify the creator, that is a new catalogue row, decided before 2b, not slipped in beside `rejected` (which is `email: Y`). Confirm before sub-scope 2b.

8. **Email delivery guarantee — at-least-once vs at-most-once — blocks sub-scope 3, not 1, 2a, or 2b.** This is a product decision, not an implementation detail. A crash can double-send `task_request.rejected` and the two permission emails, or it can drop them. Recommended default: at-least-once, by the held-open claim in §4 (claim `email_sent_at` inside a transaction that stays open across the SMTP call; roll the claim back if the send throws). A duplicate happens only when the process dies after the server accepts the message and before commit. At-most-once means committing the claim before the send, which drops the mail when SMTP throws and the retry sees a non-null timestamp. Pick one before the SMTP issue. Do not implement both.

9. **Self-notification.** ADR-0014 names who is not a recipient only for `task.released`. It does not say "never notify the actor who clicked" for every event. CONTEXT allows Task Request self-approval with a reason (`task_request.self_approve` in `CONTEXT.md`). A self-approved request would then notify its own creator. Recommended: allow that. Do not add a global suppression in sub-scope 2b. Confirm before 2b wires `task_request.approved`, because the in-app row would be the actor's own action even though that row is not `email: Y`.

Not open, restated so the issue does not relitigate them: no rules table, no admin rule UI, no per-Actor opt-out, no Slack/Teams/push, no third-party email API, no audit-log-as-inbox, no i18next, no subscribe control on the VOC kebab, no notification on `task_status_changed` itself, pg-boss stays in-process, mock channel in CI.

## 7. Suggested issue title

"Notifications: in-app catalogue and inbox" — not "Notification Rule." The rule engine was the rejected design.

## Revision (opus review addressed)

Date: 2026-09-26. Edited in place against `.review/RESEARCH-1-notification-rule-OPUS-REVIEW.md`. Claims that review marked accurate are unchanged. ADR-0014 was not reopened.

- `task_request.assigned_to_me` is dropped from the call-site scope. `reviewer_actor_id` is set only at decision time. Open question 6 treats it like `survey.assigned_to_me`: omit from the first catalogue PR.
- `task.assigned_to_me` is narrowed to assignee set at conversion. No reassignment endpoint exists, so "changed" is gone.
- `notify` goes through an injected `NotificationDispatcher`, the same shape as `embeddingEnqueuer`. That port is sub-scope 1, because `boss` is optional on `buildServer` and 77 test files call `buildServer(`. Sub-scope 2a plumbs the port into `createPublicUpdateReviewCandidatesService` in `index.ts`, which today takes only `{ db, auditService }`.
- `email_sent_at` has one mechanism: claim inside a transaction held open across the SMTP call, and roll the claim back if the send throws. At-least-once vs at-most-once is open question 8, not an implementation detail.
- `event_type` is the catalogue key union at compile time. An unknown runtime value throws. The no-op-when-missing path is gone.
- The migration sibling is `0032` (table + `GRANT SELECT, INSERT` + queue insert) and `0033` (column-scoped `GRANT UPDATE`), not queue-only `0004`. Grants are `SELECT`, `INSERT`, and `UPDATE` on `read_at`, `archived_at`, `email_sent_at` only. No `DELETE`. Sub-scope 1 tests that `fops_app` cannot `UPDATE summary` or `DELETE`.
- `correlation_id` is `uuid`, matching `public_update_review_candidates.correlation_id`.
- Sub-scope 2 is split into 2a (VOC + release worker, blocked by questions 2 and 3) and 2b (Task / Task Request / Permission, blocked by questions 5 and 7). Each names its own test-harness blast radius. 2b can start before 2a's recipient decisions.
- Open question 7 is the Task Request analogue of question 5: `task_request_needs_more_evidence` and `task_request_self_approval_denied`.
- The bell target is `/`, the route Home owns. `/integration` stays a different surface even though its nav label says "Action dashboard".
- Also corrected from the same review: read and archive do not take `Idempotency-Key` (they are naturally idempotent; current producers already require the key via `requireIdempotencyKey`, so the mint-a-uuid branch is not used). `SmtpEmailChannel` lives in its own file behind the env switch. Self-notification is open question 9 instead of a rule stated as if ADR-0014 had already decided it.

<!-- RESEARCH-1-REVISED-DONE -->
