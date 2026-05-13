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
- Approval and conversion show source evidence before decision.
- Rejection and needs_more_evidence require decision note.
- Review may be performed by Admin or by Developer within the same Managed System scope.
- Same-Developer self-approval requires explicit scoped capability, reason, and visibly audited self-approval metadata.
- Conversion must show created Task and preserved source links.
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

## Task Board Boundary

```text
- Task Board is for internal execution work only.
- VOC owner assignment is not Task assignee or kanban assignment.
- Assigned Backlog Tasks may appear in My Work as planned work, but execution starts only when the Task moves to Todo or Doing.
```

## Permission Request State Machine

```text
blocked
-> request_opened
-> pending
-> approved | rejected | expired | revoked
```

UX rules:

```text
- Blocked content must explain the access category without leaking restricted details.
- Sensitive permission requests require reason before submission.
- Pending requests show who can approve when available.
- Rejected requests show safe rejection copy and may allow a new request.
- Approved requests return the user to the blocked object or action when possible.
- Explicit Deny overrides allow and should show a non-requestable blocked state unless policy allows appeal.
```

## Permission-Limited Linked Objects

Linked objects render as one of:

```text
- hidden existence: user cannot know the object exists
- summary_visible placeholder: backend-provided safe summary
- request-access panel: existence visible, detail blocked
```

The frontend must use backend-provided visibility decisions and summaries. It must not infer summaries from hidden raw data.

## Home And Integration Recovery Queues

Queue rows must answer:

```text
- what is wrong
- why it matters
- what to do next
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
```
