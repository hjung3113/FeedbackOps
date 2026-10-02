# Navigation

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Navigation Count Contract

`GET /nav/counts`

- Authenticated, workspace-scoped read endpoint returning `{ counts: Record<string, integer> }`.
- Optional `managed_system_id` is a UUID and narrows each emitted count through the same
  predicate and resolved read scope as its backing list route. Invalid values return
  `validation.failed` (422).
- Currently emitted keys are `voc.inbox`, `voc.triage`, `voc.my`, `voc.tab.high`,
  `voc.tab.unassigned`, `voc.inbox.no-link`, `voc.clusters`, `findings.all`, and
  `surveys.all`. The VOC keys use the shared VOC list predicate; the other keys
  call their owning list read services. A key is absent only when it has no backing
  list filter or when scope resolution returns the expected `permission.denied` or
  `permission.scope_required` authorization outcome. An absent key is not zero and
  may be permission-shaped; any unexpected failure propagates as an error response
  rather than omitting the key.
- `voc.tab.similar` is deliberately absent because that list tab has no backing query.
- A key without a backing list filter is omitted rather than represented by a synthetic zero.
- Read-only endpoint: no audit event, entity-link mutation, or dashboard queue side effect.

## Route Resolution Contract

`GET /nav/resolve?display_id=<id>`

- Backend route-resolution endpoint for the command palette: a workspace display id
  (`VOC-<n>`, `FIN-<n>`, `REQ-<n>`, `TASK-<n>`) resolves to the record's id plus a route
  intent. `SRV-`/`MLS-`/`CLU-` display ids are out of scope for this first version and
  validate as failures.
- Authenticated, workspace-scoped read endpoint on the **read** rate tier with
  `cache-control: private, no-cache`. No audit event, no side effects, no entity-link
  writes.
- Input normalisation: the value is trimmed and upper-cased before matching. Accepted
  grammar after normalisation: `^(VOC|FIN|REQ|TASK)-[1-9][0-9]*$`. The query schema is
  strict: `display_id` is required, unknown query keys are rejected, and every validation
  failure — missing param, unknown key, empty string, unknown prefix, zero or
  non-numeric counter — returns `422 validation.failed` with
  `fields: [{ path: ['display_id'], code: 'invalid_display_id' }]`.
- Each owning module performs the `(workspace_id, display_id)` lookup through its own
  repository and applies **exactly the read authority its detail read applies** (VOC:
  `GET /vocs/:id`'s access matrix, including the reporter arm; Finding: `GET /findings/:id`;
  Task: `GET /tasks/:id`; Task Request: the Task Request list read's per-row authority).
  The nav module only dispatches by prefix and builds the route intent.
- Missing, foreign-workspace, and not-readable records all return the identical
  `404 not_found.record` body (no existence probe). A permission-limited but visible
  detail payload (e.g. the VOC summary envelope) counts as readable. Authorization-absence
  outcomes (`permission.denied`, `permission.scope_required`) are treated like not-found;
  unexpected errors propagate.
- Success response (shared schema `navResolveResponseSchema` in `@fops/shared`):
  `{ entity_type: 'voc' | 'finding' | 'task_request' | 'task', id: <uuid>,
  display_id: <normalised id>, route_intent: { route, search } }` — `route` is the path
  (`/vocs`, `/findings`, `/tasks`), `search` the deep-link query keys:
  VOC → `/vocs?view=inbox&selected=:id`; Finding → `/findings?selected=:id`;
  Task Request → `/tasks?view=requests&selected=:id`; Task → `/tasks?view=board&selected=:id`.
  No title or other record content is returned.
