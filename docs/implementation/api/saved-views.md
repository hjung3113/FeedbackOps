# Saved Views

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Saved Views

```text
GET /saved-views
POST /saved-views
GET /saved-views/:id
PATCH /saved-views/:id
DELETE /saved-views/:id
```

`GET /saved-views` accepts an optional `surface` query with one of `voc`,
`tasks`, `task_requests`, or `findings`. Create requires `surface`, `name`, and
`filter`; update accepts `name` and/or `filter`. Create and update return
`409 conflict.saved_view_name_taken` when the actor already has a saved view
with that `surface` + `name`.

On create and update, the `filter` object is parsed against the list-query
schema for its selected surface: VOC, Tasks, Task Requests, or Findings. The
mapping lives in `apps/backend/src/modules/saved-views/service.ts`. The VOC
filter may carry `q` (the inbox search term) alongside the other list keys.

For Tasks, Task Requests and Findings the persistence boundary uses the strict
list-filter schemas with `cursor` and `limit` omitted. Create and update reject
those paging keys, and a stored historical payload containing either fails
closed with the same `422 validation.failed` as any invalid stored filter.
The original validated wire input remains the persisted value.
