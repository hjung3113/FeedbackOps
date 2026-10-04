# Notifications

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This
file is the normative contract for the endpoints below.

## Producers

Each producer resolves recipients inside the request transaction, writes the
domain change and audit row, then calls `notify()` in that same transaction.
The dispatcher drops recipient Actor ids that do not belong to the event's
workspace before enqueueing jobs.

| Event | Producer | Recipients |
| --- | --- | --- |
| `voc.assigned_to_me` | `voc/commands/update-triage.ts` `updateVoc` (exposed via `voc/service.ts`) | The newly assigned user owner; team-only ownership has no Actor recipient. |
| `voc.reporter_replied` | `voc/conversation-service.ts` `postReporterReply` | The current user owner, if set, plus every workspace Actor with `role_level = admin`. |
| `voc.severity_set_high_or_critical` | `voc/commands/update-triage.ts` `updateVoc` (exposed via `voc/service.ts`) | On a change to `high` or `critical`, the current user owner, if set, plus every workspace Actor with `role_level = admin`. |
| `task_request.approved`, `task_request.rejected`, `task_request.needs_more_evidence` | `task-requests/service.ts` `decideTaskRequest` | The Task Request creator (`requester_actor_id`), including self-approval. |
| `task.assigned_to_me` | `tasks/service.ts` `convertTaskRequest` | The new assignee, only when `assignee_actor_id` is set. |
| `task.released` | `voc/public-update-review-candidates/service.ts` `createForReleasedTask` | The linked VOC's current user owner, once per newly inserted review candidate, unless that owner is the releasing actor, Task assignee, or Reporter. |
| `permission_request.submitted` | `permissions/request-service.ts` `createRequest` | Every workspace Actor whose `role_level` is `admin`. `core.actors` has no active/deactivated flag. |
| `permission_request.decided` | `permissions/decision-service.ts` `decide` | The requester, for `approve` (`approved`), and `reject` or the explicit `deny` (both `rejected`); `need_more_info` does not notify. |

No notification is created for Permission Request `need_more_info`, Task Request `self_approval_denied`, idempotent
replays, no-op Task Request decisions that already have the target status,
no-op VOC owner or severity updates, `low`/`medium`/null VOC severity changes,
`voc.assigned_to_me` or `task.released` for a team-only VOC (no user owner), or
a `task.released` candidate insert skipped by its unique key. Team-only ownership
removes only the owner from `voc.reporter_replied` and
`voc.severity_set_high_or_critical` recipients; workspace admins are still
notified. The `task.released` policy excludes the releasing actor, Task
assignee, Reporter, and worker actor when the owner matches; this producer can
compare the first three ids, while the release payload and linked rows expose
no worker Actor id. VOC create requests do not accept owner or severity fields.
Notification details contain ids only; decision reasons, notes, reply bodies,
titles, and other free text stay in their domain records and audit events.

## Notifications Inbox

`GET /notifications`

- Authenticated and scoped to the session Actor and workspace. It returns only
  that Actor's notification rows; there is no list-all or recipient override.
- Optional `unread` is `true` or `false`. Optional `include_archived` defaults
  to `false`; `limit` defaults to `50` and must be an integer from `1` through
  `100`. `cursor` is an opaque cursor for the `(created_at, id)` descending
  order.
- Returns `{ items, page, unread_count }`. Each item contains `id`,
  `event_type`, `subject_type`, `subject_id`, `summary`, `detail`,
  `created_at`, `read_at`, `archived_at`, and `subject_ref`. `page` contains
  `has_more` and, when another page exists, the next `cursor`.
- `subject_ref` is optional in the shared DTO for compatibility with older
  clients and fixtures. New API responses always include either
  `{ visibility_state: 'allowed', display_id, title }` or
  `{ visibility_state: 'unavailable' }`.
- Subject text is resolved at read time for the current Actor. VOC and public
  update review candidate references use the canonical VOC read decision;
  Task and Task Request references use their Entity Link provider read gate;
  Permission Request references are available only to the requester or a
  workspace admin. Missing, archived, hidden, denied, summary-only, or unknown
  subjects return only `{ visibility_state: 'unavailable' }`.
- Notification rows continue to store subject ids and event summaries only.
  They do not store a historical subject title or display id, so later reads
  reflect current authorization and current subject text.
- `event_type` is one of `voc.assigned_to_me`, `voc.reporter_replied`,
  `voc.severity_set_high_or_critical`, `task_request.approved`,
  `task_request.rejected`, `task_request.needs_more_evidence`,
  `task.assigned_to_me`, `task.released`, `permission_request.submitted`, or
  `permission_request.decided`.
- The closed event set is `notificationEventTypeSchema` in
  `packages/shared/src/notifications.ts`.
- `unread_count` counts this Actor's unarchived rows whose `read_at` is null;
  it is independent of the current page, cursor, and unread filter.
- Sets `cache-control: private, no-cache`. Invalid query parameters or cursor
  return `validation.failed` (422).

`POST /notifications/:id/read`

- Authenticated and scoped to the session Actor and workspace. A notification
  owned by another Actor, another workspace, or an unknown id returns
  `not_found.record` (404).
- Sets `read_at` once and returns the updated notification. Repeating the
  request preserves the first `read_at`; no `Idempotency-Key` is required.
- Uses the `notification_state` rate-limit tier (60 requests per minute per
  Actor, its own bucket separate from `mutation`).

`POST /notifications/:id/archive`

- Uses the same authentication, Actor/workspace scope, 404 behavior, response,
  and `notification_state` rate-limit tier (60 requests per minute per Actor,
  its own bucket separate from `mutation`) as the read endpoint.
- Sets `archived_at` once and preserves `read_at`; archiving does not mark the
  notification as read. No `Idempotency-Key` is required.

Invalid notification ids return `validation.failed` (422). Notification rows
are recipient-private: ownership checks are part of each read and mutation
query, so a foreign row is indistinguishable from an absent row.
