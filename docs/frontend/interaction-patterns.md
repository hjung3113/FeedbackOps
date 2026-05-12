# Interaction Patterns

## Purpose

This document defines workflow-level UX behavior that individual components cannot fully describe.

## Cross-System Creation Rule

Every cross-system creation flow must show:

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
untriaged
-> classified
-> owner_assigned
-> finding_created | task_requested | public_update_written | no_follow_up
```

UX rules:

```text
- Triage actions stay in list/detail context.
- High severity VOC without Finding should surface in Dashboard recovery queues.
- Public update writing must use PublicUpdateComposer, never internal comment input.
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
- Conversion must show created Task and preserved source links.
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

## Dashboard Recovery Queues

Queue rows must answer:

```text
- what is wrong
- why it matters
- what to do next
```

Resolution semantics:

```text
- High Severity VOC without Finding is resolved when a valid Finding link exists or manager marks no follow-up.
- VOC Cluster without Finding is resolved when created_finding link exists.
- Finding without Task Request is resolved when requested_task, created_task, created_milestone, linked_existing_task, or not_actionable exists.
- Released Task with unresolved reporter-facing VOC status is resolved when manager confirms public status review.
- Bad Outcome Survey without follow-up is resolved when follow_up_for or requested_task link exists.
```

## Workflow-Level Empty And Error States

```text
No VOC yet:
- show create VOC action for users with permission.

No dashboard recovery items:
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

