# Interaction Patterns

## Purpose

This document defines workflow-level UX behavior that individual components cannot fully describe.

## Cross-System Creation Rule

Every cross-system creation flow must preserve source context. Default UI may be progressive, but the flow must make the following contract available:

```text
- source object preview
- target object draft fields
- relation_type to be created
- visibility to be applied
- permission impact
- pending state for target creation
- pending state for entity_link creation
```

If target creation succeeds but entity link creation fails:

```text
- keep the created target visible
- show a repair-link action
- preserve source context
- do not silently remove the target from the UI
```

## Linked Context Preview Rule

Surfaces that show related objects should show only the minimum context needed
for the current task. Detailed linked-object content belongs in that object's
DetailPanel or route.

```text
- List rows, board cards, queue rows, and compact summaries show linked-object type, title or safe summary, status/signal, and jump action.
- They should not inline full VOC descriptions, full Finding analysis, full Evidence text, Survey response detail, or Task execution detail unless the current surface owns that object.
- Detail panels may show richer linked context when it directly supports the current action, but still provide a jump action to the source object.
- Permission-limited linked context uses backend-provided summary_visible or hidden decisions.
- The goal is traceability without turning every surface into every other surface.
```

Linked-context jump actions:

```text
- navigate to the linked object's owning route inside the same AppShell.
- restore selected detail panel or mobile drill-in for the linked object when possible.
- confirm before leaving a dirty form or unsaved composer.
- use the same route intent from visible buttons, row links, LinkedEntityTrail nodes, and CommandMenu actions.
```

Dashboard recovery detail panels are shallow coordination panels. They render the
API-provided recovery reason, safe affected-object summaries, next actions,
presentation state such as snooze or mute, and source-object jump actions. They
must not become full VOC, Finding, Task, or Survey detail surfaces.

If a recovery item resolves while its detail panel is open, keep the panel open
with a resolved state, source of resolution when the API provides it, and actions
to close the panel or move to the next item. Do not make the panel disappear
without explaining whether the current actor or another workflow action resolved
it.

## Next Action Rendering Rule

Work-object detail panels, Survey Result and Response screens, Home queues,
Dashboard queues, and Integration recovery queues render backend-provided
`next_actions`.

```text
- Frontend must not infer action eligibility from status fields, Role Level labels, or linked-object presence.
- Frontend may sort, group, or visually prioritize provided actions when the API marks priority or primary action.
- Hidden or blocked actions must follow backend-provided visibility and blocked-reason decisions.
- CommandMenu verbs must invoke the same provided action ids as visible UI buttons.
```

Action visibility states:

```text
- available: render as executable.
- blocked_requestable: render a request-access or missing-prerequisite affordance.
- blocked_not_requestable: render the backend-provided reason only when the API says it is safe to show.
- hidden: render nothing and do not mention the action.
```

For `blocked_requestable`, render only API-provided permission request scope
candidates or prerequisite request intent. Do not infer broader request scopes
from the route, role label, selected Managed System switcher, or visible status.

When `next_actions` include confirmation metadata, render that backend-provided
confirmation copy, risk level, required reason fields, and audit context. Do not
invent generic confirmation text for audit-sensitive actions.

Permission approval must not auto-run the originally blocked action. After
approval, return the actor to the original object or action intent and require a
new explicit execution.

Failed action execution must render the structured action failure returned by
the API. Distinguish retryable failures, permission-requestable failures, stale
object versions, action no longer available, and already-resolved recovery
items. Preserve local input when the action can be retried after refresh or
permission request.

Common VOC action ids:

```text
- assign_owner
- request_reporter_info
- write_public_update
- create_finding
- request_task
- mark_no_follow_up
- review_reporter_status
```

Common Survey follow-up action ids:

```text
- add_evidence_highlight
- create_finding
- link_finding (deferred out of MVP scope; ADR-0037)
- request_task
- attach_evidence_to_existing_voc
- mark_no_follow_up
```

`mark_no_follow_up` for Survey appears only on a poor Outcome Survey detail or
specific follow-up gap detail when the API provides it. It must not be rendered
as a bulk or top-level action on an aggregate Survey Result overview.

## VOC Triage State Machine

```text
submitted
-> unassigned
-> owner_assigned
-> classified
-> finding_created | task_requested | public_update_written | no_follow_up
```

UX rules:

```text
- Triage actions stay in list/detail context.
- Unassigned must be a direct VOC Triage view because ownership is the first operational failure mode.
- High severity VOC without configured follow-up should surface in Home or Integration recovery queues.
- Assignment, classification, reporter-facing status, Finding creation, and Task creation are separate decisions.
- Public update writing must use PublicUpdateComposer, never internal comment input.
- VOC creation requires Managed System, may include Analytics Area under that Managed System, may include Source Context, and must not ask Reporter for severity.
- Reporter Reply goes into the public VOC conversation; it must not be stored as Internal Comment.
```

## Task Request State Machine

```text
draft
-> pending_review
-> approved | rejected | needs_more_evidence
-> converted
```

UX rules:

```text
- VOC, VOC Cluster, Finding, and Survey-derived Finding follow-up uses "Request Task", not "Create Task".
- "Create Task" is reserved for standalone internal Tasks from the Tasks surface.
- "Convert to Task" is the review action that turns an approved Task Request into a Backlog Task.
- Approval accepts the execution candidate; conversion creates the Task.
- UI may offer "Approve and Convert" as a fast path while still showing source evidence and required Task fields.
- Approved-only Task Requests remain actionable until converted or linked to an existing Task.
- Link Existing Task is the alternative to conversion when suitable work already exists.
- Approval and conversion show source evidence before decision.
- Rejection and needs_more_evidence require decision note.
- Review may be performed by Admin or by Developer within the same Managed System scope.
- Same-Developer self-approval requires explicit scoped capability, reason, and visibly audited self-approval metadata.
- Conversion must show created Task and preserved source links.
```

## Survey Result Action Boundary

```text
- Survey Result and Survey Response surfaces must not show Create VOC.
- Allowed follow-up actions are Create Finding, Link Finding (deferred out of MVP scope; ADR-0037), Request Task, Add Evidence Highlight, and optional Attach to Existing VOC.
- Attach to Existing VOC uses action id `attach_evidence_to_existing_voc` and links survey evidence to an already existing VOC; it must not create a new VOC.
- Do not label this action Create VOC, Convert to VOC, Generate VOC from Response, or Link Existing VOC.
- Survey-derived Request Task follows the Task Request flow and review boundary.
```

## VOC Communication Surfaces

```text
Public Update:
- Admin or same Managed System Developer authored.
- Reporter-visible.
- Uses its own composer and cannot share input with Internal Comment.

Reporter Reply:
- Reporter authored.
- Added to the public VOC conversation.
- May move Waiting Reporter work back into an internal follow-up queue without directly changing reporter-facing status.

Internal Comment:
- Private operational note for Admins and scoped Developers.
- Never appears in Reporter Summary or the public conversation.

MVP conversation constraints:
- Public Update and Reporter Reply share a public VOC timeline.
- Internal Comment uses a separate internal timeline.
- Conversation is append-only and not real-time chat.
- Mentions, reactions, read receipts, threaded replies, and general edit/delete flows are later features.
- Cluster update candidates are not auto-sent; selected VOCs receive individual Public Updates when applied.
```

## Reporter Summary Rules

```text
- Show only public-safe linked-work summary fields.
- Do not expose raw Task statuses such as Backlog, Todo, Doing, Review, Done, Released, or Reopened.
- Do not expose internal comments, priority, developer discussion, severity, confidence, private due dates, or root-cause detail.
- Internal Task status can inform a public-safe reporter-facing VOC status only through VOC-owned review/update behavior.
```

## Reporter-Facing Status Change Rule

```text
- Reporter-facing VOC Status changes must be explicit actions by Admin or same Managed System Developer.
- A status change can happen through Public Update composition or through a reporter-status review action.
- Task Done, Task Released, Reporter Reply, and cluster update candidates must not auto-change reporter-facing status.
- UI should prompt the actor to consider a Public Update when changing reporter-facing status.
- The default status-change surface opens PublicUpdateComposer.
- `skip_public_update` is allowed only when the actor enters a `skip_reason`.
- Valid skip reasons include accidental status correction or avoiding duplicate communication after a recent Public Update.
- Reporter-facing status changes are per-VOC decisions. Bulk candidates may
  support selected target review and draft message reuse, but they must not
  apply a direct bulk status mutation.
```

## Task Board Boundary

```text
- Task Board is for internal execution work only.
- VOC owner assignment is not Task assignee or kanban assignment.
- Board cards show minimal linked context indicators only; source VOC, Finding, Survey, Evidence, and reporter-facing update detail belongs in Task Detail or the source object's route.
- Assigned Backlog Tasks may appear in My Work as planned work, but execution starts only when the Task moves to Todo or Doing.
```

## Milestone Timeline Boundary

```text
- Milestones are internal Task grouping surfaces.
- The Milestones list shows compact rows and a mini timeline for schedule risk scanning.
- Selecting a Milestone opens Milestone Detail in RightDetailPanel on desktop.
- Milestone Detail owns the full context: Overview, Timeline, Tasks, Evidence, and Activity.
- The full Gantt chart appears only as the Timeline section inside Milestone Detail.
- The Gantt shows child Tasks by date and internal Task status for authorized internal users.
- Reporter-facing summaries must not expose raw Gantt bars, internal Task status, backlog priority, private due dates, or Developer discussion.
```

## Permission Request State Machine

```text
blocked
-> request_opened
-> pending
-> needs_more_info -> pending
-> approved | rejected | expired | revoked
```

UX rules:

```text
- Blocked content must explain the access category without leaking restricted details.
- Permission requests start from the blocked object or blocked action when the backend marks it requestable.
- Request creation captures target object or action, requested scope, reason, and return route intent when available.
- Sensitive permission requests require reason before submission.
- Pending requests show who can approve when available.
- Needs More Info requests show the Admin question and let the requester update reason, scope, or duration before resubmitting.
- Rejected requests show safe rejection copy and may allow a new request.
- Approved requests return the user to the blocked object or action when possible.
- Explicit Deny overrides allow and should show a non-requestable blocked state unless policy allows appeal.
```

## Permission-Limited Linked Objects

Linked objects render as one of:

```text
- allowed: user can see the linked object preview and jump action.
- hidden: user cannot know the linked object exists.
- summary_visible: user can see only backend-provided safe summary fields.
- request_access: user can see restricted existence and request access.
- denied: user can see that access is not available or was explicitly denied, without a request CTA unless policy allows appeal.
```

Examples:

```text
- A Task linked to a VOC in the actor's Managed System scope shows VOC title, safe status, and jump action.
- A Task linked to a VOC outside scope may show "Restricted VOC" plus safe summary only if the backend returns summary_visible.
- If access can be requested, render PermissionBlockedPanel with Request Access.
- If the backend returns hidden, render nothing and do not imply that a hidden link exists.
```

The frontend must use backend-provided visibility decisions and summaries. It must not infer summaries from hidden raw data.

## Home And Integration Recovery Queues

Queue rows must answer:

```text
- what is wrong
- why it matters
- what to do next
```

Shared recovery identity:

```text
- Home, Dashboard, and Integration may show the same underlying recovery item with different presentation.
- Home includes a shared recovery item only when the current actor can personally act on it now.
- Shared items must use the same recovery_item_id or source/action identity.
- Resolving an item from Dashboard, Integration, Home, or the source object's detail must update every surface.
- UI must not maintain separate Home-only, Dashboard-only, or Integration-only resolution state for the same workflow gap.
- Backend/domain services decide whether a recovery item is resolved.
- Frontend must refresh or apply backend-returned queue state after action success; it must not infer resolution from linked-object presence alone.
```

Queue inclusion rule:

```text
- Missing-link queues include records only when a link or follow-up is expected by policy or workflow configuration.
- Expected-link sources are workspace policy, Managed System policy, severity rule, VOC Cluster needs_synthesis state, explicit workflow configuration, Released Task with unresolved Reporter-facing VOC Status, or poor Outcome Survey with configured follow-up.
- Do not show every unlinked VOC, Finding, Task, Survey Result, or Evidence record as incomplete.
```

Resolution semantics:

```text
- Unassigned VOC is resolved when an accountable owner or team exists, or when workspace policy marks ownership optional.
- High Severity VOC eligible for follow-up is resolved when a valid Finding, Task Request, Task link, or authorized no-follow-up-needed decision exists.
- Missing Finding alone is not actionable unless workspace policy requires Finding synthesis.
- VOC Cluster marked "needs synthesis" is resolved when created_finding link exists or synthesis is dismissed.
- Finding marked actionable is resolved when requested_task, created_task, created_milestone, linked_existing_task, or not_actionable exists.
- Released Task with unresolved reporter-facing VOC status is resolved when an authorized Admin or Developer confirms public status review.
- Bad Outcome Survey without follow-up is resolved when follow_up_for or requested_task link exists.
```

## Workflow-Level Empty And Error States

```text
No VOC yet:
- show create VOC action for users with permission.

No Home or Integration recovery items:
- show quiet empty state that all monitored queues are clear.

Linked object hidden by permission:
- show permission-limited state or safe summary.

Survey responses hidden:
- show aggregate summary if allowed; hide personal response details.

Cross-system mutation failure:
- preserve input and source context.
- offer retry.
- show whether target creation or entity_link creation failed.
- for `next_actions`, use the structured action failure payload to distinguish
  retryable, permission-requestable, stale-version, action-unavailable, and
  already-resolved states.
```
