# API Contracts

## Purpose

Endpoint authority is this index together with `docs/implementation/api/*.md`.

This file owns global API rules, standard error codes, the endpoint contract template, default owner/reviewer resolution, and scoped-create requirements. Each file under `api/` owns one domain's behavior and its endpoint catalog. A route has one normative home. Do not restate it here.

Detailed schemas may later move into OpenAPI; until they do, `api/*.md` remains the behavioral contract and this file remains the index.

## Index

| Domain file | Sections |
|---|---|
| [`api/navigation.md`](api/navigation.md) | Navigation Count Contract; Route Resolution Contract |
| [`api/auth.md`](api/auth.md) | Authentication |
| [`api/attachments.md`](api/attachments.md) | Attachments |
| [`api/dashboard.md`](api/dashboard.md) | Dashboard Summary Contract; Coverage settings; Recovery queue/detail/presentation/history (proposed/new); Analytics Area Report Contract (accepted, proposed/new) |
| [`api/voc.md`](api/voc.md) | VOC; VOC Create And Conversation Contract; PATCH /vocs/:id/description — Reporter pre-triage edit (Slice 3 #17); VOC List And Triage Fields; VOC Similarity Projection; Task release side effect (Issue #165); POST /vocs/:id/create-finding; VOC Recommendations |
| [`api/voc-clusters.md`](api/voc-clusters.md) | VOC Cluster |
| [`api/findings.md`](api/findings.md) | Finding; Progress notes |
| [`api/tasks.md`](api/tasks.md) | Task Request Create From Finding Contract; Task Request Review Contract; Task Conversion Contract; Task Request Create From VOC / VOC Cluster Contract; Task; Progress notes; PATCH /tasks/:id — Task status transition (Slice 7 #138); POST /tasks/:id/milestone — Task milestone assign (issue #514 B1b) |
| [`api/milestones.md`](api/milestones.md) | Milestone Create Contract; Milestone List Contract; Milestone Detail Contract; Milestone Update Contract; Status; Not implemented |
| [`api/surveys.md`](api/surveys.md) | Survey; GET /me/survey-responses — the session Actor's own response history; GET /me/answerable-surveys; GET /surveys/:id/results; GET /surveys/:id/outcome-follow-up; Survey response evidence approval; POST /survey-responses/:id/create-finding; POST /survey-responses/:id/mark-no-follow-up and /reopen-follow-up; Forbidden Endpoint |
| [`api/core.md`](api/core.md) | Core / Health / Managed System / Analytics Area |
| [`api/permissions.md`](api/permissions.md) | Permission |
| [`api/notifications.md`](api/notifications.md) | Notifications Inbox; Producers |
| [`api/saved-views.md`](api/saved-views.md) | Saved Views |
| [`api/entity-links.md`](api/entity-links.md) | Entity Links; Workspace inventory pagination |
| [`api/next-actions.md`](api/next-actions.md) | Next Action Contract |
| [`api/cross-system.md`](api/cross-system.md) | Reporter Summary Contract; Cross-System Endpoint Decisions |

## Global API Rules

```text
- All workspace-scoped endpoints validate workspace context.
- All mutating endpoints check permission before writing.
- Cross-system creation endpoints preserve source context.
- Cross-system creation endpoints create required entity_links in the same application transaction when possible.
- Sensitive decisions emit audit events.
- APIs must not expose Survey Response -> Create VOC.
- APIs must not expose generated_voc relation_type.
- List endpoints for Tasks, Task Requests, Findings, VOC triage, Surveys, and Dashboard queues must accept managed_system_id filters where scoped data can appear.
- Accepted close-out target, implementation pending (ADR-0067 supersedes ADR-0059 D3; applies to the next eight bullets). Today only `GET /dashboard/summary` ships. Recovery additions follow `api/dashboard.md`, including the ADR-0055 Survey adapter exception; no generic response identity is exposed to non-personal holders.
- Dashboard, Home, and Integration recovery queue endpoints that expose the same workflow gap must return a stable `recovery_item_id` or equivalent source/action identity.
- Recovery queue inclusion and resolution are backend/domain-service decisions. Frontend clients must not infer that a recovery item is resolved from linked-object presence alone.
- Dashboard recovery queue endpoints may expose user-level snooze or mute state, but that state must not change the recovery item's domain resolution state.
- Dashboard recovery item detail responses must include `recovery_item_id`, recovery reason, source identity, safe affected-object summaries, permission-filtered `next_actions`, presentation state such as snooze or mute, and route intents for source-object jumps.
- Recovery detail responses must distinguish gap visibility from source-object visibility. A response may include a summary-safe recovery item while hiding source titles, source route intents, or blocked actions according to backend visibility decisions.
- Dashboard recovery queue responses must include backend-computed priority, severity, and reason codes when the UI needs ordering or emphasis. Clients may sort or group provided values but must not compute operational priority independently.
- Dashboard recovery queue responses may include `responsible_actor_hint`, derived from the source object's owner, reviewer, assignee, permission reviewer, or workflow policy. Recovery items must not expose independent owner mutation.
- Dashboard metric responses must include `computed_at` when values may be stale. Active recovery queues should prioritize current workflow state over metric cache freshness. Resolved recovery items are removed from active queues but remain available in Dashboard activity/history for three months. History responses expose safe summaries and resolution metadata only; source-object jumps require current permission checks.
- Backend responses must exclude objects outside the actor's effective Managed System Permission Scopes.
- managed_system_id=all means the actor's effective Managed System scope union. Only workspace Admin receives true workspace-wide results.
- Managed System scope is the MVP filter, defaulting, and Developer permission context; APIs must not create separate per-Managed-System VOC, Survey, Task, or Integration route trees.
- Analytics Area filters are allowed only within the selected Managed System and do not grant authorization.
- Work Initiative or Project identifiers may appear only as future execution grouping fields and must not replace managed_system_id in MVP-scoped records.
- Rich content fields must reference inline images through attachment IDs, not base64 body data or external image URLs.
```

## Standard Error Codes

Error codes are `<subject>.<verb-or-state>`, lowercase dotted (e.g. `validation.failed`,
`permission.denied`, `conflict.stale_write`) — not the underscore names this section used to list.
The authoritative, currently-evolving list is the `ERROR_CODES` Zod enum in
`packages/shared/src/errors/codes.ts`; do not hand-copy it here, it will drift. The stable
family → HTTP status mapping and full envelope shape are in `docs/adr/0012-error-code-contract.md`.

## Endpoint Contract Template

Each endpoint must define:

```text
- requirement_id
- method and path
- request body
- response body
- auth and permission
- validation errors
- side effects
- audit events
- entity_links created, updated, detached, or revoked
- dashboard queues affected
- managed_system scope and default owner/reviewer resolution when applicable
- idempotency behavior
```

Audit-sensitive mutation endpoints must require an optimistic concurrency token
such as `expected_version` or `last_seen_at`. On mismatch, APIs must return a
conflict-style response with the current object version and must not auto-merge
or apply the stale action. Only five endpoints implement this token, as a
required `If-Match` header: `PATCH /vocs/:id`, `PATCH /vocs/:id/description`,
`PATCH /tasks/:id`, `POST /tasks/:id/milestone`, and `PATCH /milestones/:id`.
Public Update send, Task Request decisions, and Permission decisions take no
token and are guarded by object state instead: Public Update send validates the
requested reporter-facing status transition against the current status
(`422 reporter_facing_status.invalid_transition`), Task Request decisions
return `422 validation.failed` for a disallowed transition and a `200` no-op
when the Task Request is already in the target status, and Permission decisions
return `409 conflict.stale_write` when the request is no longer decidable.
Survey evidence attachment to VOC has no route. The preceding token coverage is
the shipped snapshot; ADR-0066 supersedes the Permission state-only contract with
proposed required expected_revision on requester edit/withdraw/supplement and all
Admin decisions. Authorization precedes replay; lock/revision checks occur inside
the idempotent run, and mismatch returns authorized current_revision only. See
`api/permissions.md` for the accepted, not-yet-implemented wire changes.

## Default Owner / Reviewer Resolution

Accepted, implementation pending: ADR-0067 supersedes ADR-0059 D1 and the former
required-reviewer/automatic-default creation rejection. Use the destination service to
persist actual responsibility for VOC, all three Finding sources, all three Task Request
sources, and approved-request Task conversion.

Order: permitted explicit Actor/team → Managed System target → active same-system
Analytics Area owner team → existing scoped fallback queue. Task Request tries the
proposed/new Managed System reviewer pair before eligible general owner. Authorized explicit
null skips defaults; omission requests them. Reject invalid explicit values with
`validation.failed`; skip invalid automatic candidates and create unassigned with an
Admin configuration warning. Preserve owning capability, Admin-bypass and explicit-deny
semantics inside the transaction; responsibility grants no scope or self-approval.
Ordinary VOC reporters cannot override owner; privileged overrides require `voc.triage`.

Field names and XOR/null rules are in `docs/design/15-data-contracts.md`. Task Request
assigned reviewer is separate from actual `reviewer_actor_id`. No provenance backfill or
retroactive reassignment. Return/audit safe proposed/new `default_resolved`, `source_rule`,
`managed_system_id`, persisted responsibility and skipped-rule categories. Automatic valid
Actor/team resolves true; explicit/null/fallback false. Reporter responses omit private
candidate IDs. Domain assignments stay current truth; lifecycle, links, audit and replay
remain atomic. Survey's explicit operator → dedicated Survey default → creator rule is
independent and unchanged. Detailed access rules: `docs/design/09-permission-access.md`.

If a request includes `analytics_area_id`, validate that it belongs to the same
Managed System. Analytics Area ownership cannot broaden or narrow the caller's
Managed System Permission Scope.

## Scoped Create Requirements

MVP create endpoints for these records must require managed_system_id, or must
derive it from a source record that already has exactly one Primary Managed
System:

```text
VOC
Finding
Task Request
Task
Survey
Milestone
```

Milestone's and VOC's create body field is `primary_managed_system_id`
([api/milestones.md](api/milestones.md), [api/voc.md](api/voc.md)).
`primary_managed_system_id` is what this section means by managed_system_id;
there is no Milestone or VOC create body field named `managed_system_id`.

VOC and Finding follow-up must create Task Request first; approved Task Requests
are then converted to Tasks.

Task Request stores the source link, evidence summary, requested outcome,
Primary Managed System, requester, reviewer decision, and review notes.
Execution fields such as Task title, assignee, priority, due date, optional
Milestone, optional Analytics Area, and execution notes are finalized during
Convert to Task. APIs may suggest defaults from the source object or Task
Request, but conversion must explicitly persist the final Task fields.
