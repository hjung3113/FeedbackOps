# Permission Policy

## Purpose

This document defines implementation rules for authorization, permission requests, and safe linked-object visibility.

## Role Level And Capability

```text
Role Levels:
- Admin
- Developer
- User
```

Role Level controls authority; backend capability checks are authoritative.
Admin is workspace-level in MVP. Developer is granted per Managed System
Permission Scope. User is the lowest role level and may submit VOC and access
their own allowed work. Reporter is the Actor who submitted a specific VOC, not
a separate role level.

## Permission Check Order

```text
1. Validate workspace context.
2. Check explicit deny.
3. Check direct capability grant.
4. Check role-derived capability.
5. Check scoped Managed System permission.
6. If denied, determine whether request access is allowed.
```

Explicit Deny overrides general Allow.

Managed System Permission Scope is the MVP authorization boundary for
Developer access. Access to one Managed System does not grant access to sibling
Managed Systems. Analytics Area is not an MVP permission boundary.

Permission scope shape:

```text
workspace_id required
managed_system_id optional for Admin, required for Developer-scoped grants
object_type/object_id optional
```

Admin grants may omit managed_system_id when the capability is workspace-level.
Developer grants must include managed_system_id for scoped VOC triage,
Findings, Task Requests, Tasks, Surveys, Dashboard queues, Public Updates, and
Internal Comments. Analytics Area filters may narrow a list query but must not be
used as the source of authorization.
Analytics Area owner_team_id may route or prefill ownership, but it does not
grant Managed System scope. Assignment to an owner or reviewer that lacks the
required Managed System permission must fail validation or enter the permission
request flow.

For list filters, managed_system_id=all means the actor's effective Managed
System scope union. Workspace Admin can receive true workspace-wide results.
Developers receive only records in their granted Managed System scopes, even
when the frontend URL says all.

## Sensitive Permissions

Sensitive permission requests require a reason:

```text
- Task backstage access
- specific Managed System access
- Survey creation
- Survey personal response access
- Export
- Admin permission
- Public Update creation
- Task Request self-approval
```

Task Request self-approval is not included in the default Developer scoped
review permission. A Developer may approve their own Task Request only when a
grant includes task_request_self_approval for the same managed_system_id. The
review request must include a reason and the audit event records self_approved,
reason, source_entity, and managed_system_id.

## Permission Request Lifecycle

```text
pending
-> approved | rejected | expired | revoked
```

Audit events:

```text
permission_requested
permission_approved
permission_rejected
permission_revoked
permission_expired
```

## Summary-Visible Contract

When entity link visibility is `summary_visible`, the target module returns a safe summary.

Task summary visible to Reporter:

```text
public_title
reporter_facing_status
owning_team_public_name
expected_resolution_date optional
last_public_update_at
public_update_excerpt
```

Forbidden in reporter summary:

```text
- internal comments
- internal assignee notes
- raw task status
- backlog priority
- individual Developer names
- internal due dates
- root-cause detail
- severity
- confidence
- private customer or survey response details
- permission decision internals
```

Public Update may be written only by workspace Admin or Developer in the same
Managed System Permission Scope. Reporter Reply may be written only by the
Reporter on their own VOC. Internal Comment remains private to authorized
Admins and same-scope Developers.

## Frontend Permission States

```text
hidden_existence
summary_visible
request_access
blocked_non_requestable
pending_request
approved
rejected
expired
revoked
```

The backend decides which state applies.
