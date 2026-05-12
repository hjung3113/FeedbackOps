# Permission Policy

## Purpose

This document defines implementation rules for authorization, permission requests, and safe linked-object visibility.

## Roles

```text
Reporter / Basic User
Contributor
Manager / PM
Admin
```

Roles are defaults. Capability checks are authoritative.

## Permission Check Order

```text
1. Validate workspace context.
2. Check explicit deny.
3. Check direct capability grant.
4. Check role-derived capability.
5. Check scoped project/team permission.
6. If denied, determine whether request access is allowed.
```

Explicit Deny overrides general Allow.

## Sensitive Permissions

Sensitive permission requests require a reason:

```text
- Task / Project backstage access
- specific Project access
- Survey creation
- Survey personal response access
- Export
- Admin permission
```

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
expected_resolution_date optional
owning_team_public_name optional
last_public_update_at
```

Forbidden in reporter summary:

```text
- internal comments
- internal assignee notes
- raw task status if not explicitly public
- private customer or survey response details
- permission decision internals
```

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

