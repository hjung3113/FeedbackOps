# API Contracts

## Purpose

Endpoint authority is this index together with `docs/implementation/api/*.md`.

This file owns global API rules, standard error codes, the endpoint contract template, default owner/reviewer resolution, and scoped-create requirements. Each file under `api/` owns one domain's behavior and its endpoint catalog. A route has one normative home. Do not restate it here.

`docs/design/archive/14-api-draft.md` is archived historical input. Not endpoint authority. Detailed schemas may later move into OpenAPI; until they do, `api/*.md` remains the behavioral contract and this file remains the index.

## Index

| Domain file | Sections |
|---|---|
| [`api/navigation.md`](api/navigation.md) | Navigation Count Contract |
| [`api/dashboard.md`](api/dashboard.md) | Dashboard Summary Contract |
| [`api/voc.md`](api/voc.md) | VOC; VOC Create And Conversation Contract; PATCH /vocs/:id/description — Reporter pre-triage edit (Slice 3 #17); VOC Similarity Projection; Task release side effect (Issue #165) |
| [`api/voc-clusters.md`](api/voc-clusters.md) | VOC Cluster |
| [`api/findings.md`](api/findings.md) | Finding; Progress notes |
| [`api/tasks.md`](api/tasks.md) | Task Request Create From Finding Contract; Task Request Review Contract; Task Conversion Contract; Task Request Create From VOC / VOC Cluster Contract; Task; Progress notes; PATCH /tasks/:id — Task status transition (Slice 7 #138) |
| [`api/surveys.md`](api/surveys.md) | Survey; Forbidden Endpoint |
| [`api/core.md`](api/core.md) | Core / Managed System / Analytics Area |
| [`api/permissions.md`](api/permissions.md) | Permission |
| [`api/entity-links.md`](api/entity-links.md) | Entity Links |
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
or apply the stale action. This applies to reporter-facing status changes,
Public Update send, Task Request approval, Permission approval or rejection, and
Survey evidence attachment to VOC.

## Default Owner / Reviewer Resolution

When creating VOC, Finding, Task Request, Task, or Survey work tied to a Managed System, application services resolve default owner or reviewer from:

```text
1. explicit request field when permitted
2. Managed System default owner / reviewer
3. Analytics Area owner team or routing hint within the same Managed System
4. workspace fallback queue
```

Resolved defaults are written to actual owner/reviewer fields and must be returned in creation responses when they affect routing, triage, review, or audit behavior. Default owner does not mark VOC triage complete, and default reviewer does not mark Task Request review complete. Analytics Area owner team is a routing/defaulting hint only and must not grant authorization. If a resolved owner or reviewer lacks required Managed System scope, the API returns validation_failed or a permission-requestable response instead of silently granting access. Creation responses and audit metadata should indicate default_resolved, the source rule, and managed_system_id. Failure to resolve a required reviewer returns validation_failed rather than creating unowned review work.

If a request includes analytics_area_id, the API must validate that the
Analytics Area belongs to the same managed_system_id. Analytics Area ownership must not
broaden or narrow the caller's Managed System Permission Scope.

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
```

Standalone `POST /tasks` creates internal work from the Tasks surface. VOC and
Finding follow-up must create Task Request first; approved Task Requests are
then converted to Tasks.

Task Request stores the source link, evidence summary, requested outcome,
Primary Managed System, requester, reviewer decision, and review notes.
Execution fields such as Task title, assignee, priority, due date, optional
Milestone, optional Analytics Area, and execution notes are finalized during
Convert to Task. APIs may suggest defaults from the source object or Task
Request, but conversion must explicitly persist the final Task fields.
