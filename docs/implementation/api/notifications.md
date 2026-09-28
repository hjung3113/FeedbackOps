# Notifications

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This
file is the normative contract for the endpoints below.

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
  `created_at`, `read_at`, and `archived_at`. `page` contains `has_more` and,
  when another page exists, the next `cursor`.
- `event_type` is one of `voc.assigned_to_me`, `voc.reporter_replied`,
  `voc.severity_set_high_or_critical`, `task_request.approved`,
  `task_request.rejected`, `task_request.needs_more_evidence`,
  `task.assigned_to_me`, `task.released`, `permission_request.submitted`, or
  `permission_request.decided`.
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
- Uses the `mutation` rate-limit tier (10 requests per minute per Actor).

`POST /notifications/:id/archive`

- Uses the same authentication, Actor/workspace scope, 404 behavior, response,
  and `mutation` rate-limit tier as the read endpoint.
- Sets `archived_at` once and preserves `read_at`; archiving does not mark the
  notification as read. No `Idempotency-Key` is required.

Invalid notification ids return `validation.failed` (422). Notification rows
are recipient-private: ownership checks are part of each read and mutation
query, so a foreign row is indistinguishable from an absent row.
