# Permission / Access System

## Purpose

Permission / Access controls who can see internal work, survey responses, exports, and admin functions.

Default access should be low after AD login.

## Boundary

Owns:

```text
- Permission Request
- Role / Permission decisions
- Explicit Deny precedence
- Scoped and expiring access
```

Does not own:

```text
- Source object data
- Entity Link relation registry
- Dashboard queue definitions
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 11-entity-linking.md
```

## AD Principle

```text
AD 로그인
→ 기본 Actor Type: Internal Member
→ 기본 Role Level: User
→ 민감 기능과 Backstage 접근은 기본 차단
```

Role Level order is Admin > Developer > User. Reporter is not a role; it is the Actor who submitted a specific VOC.

## Default User Can

```text
- VOC 작성 without a permission request
- 본인 VOC 상태 확인
- 본인에게 할당된 Survey 응답
- 공개 또는 허용된 Dashboard 일부 조회 optional
```

## Default User Cannot

```text
- Task 내부 댓글 조회
- Task Backstage 접근
- Survey 개인 응답 조회
- Export
- Role / Permission 변경
```

## Role Level, Scope, Capability

Role Level and grants control authorization. Capabilities are the authoritative permission decision.

Role Levels:

```text
- User: Submit VOC, My VOCs, assigned Surveys
- Developer: My Work, assigned/scoped VOC triage, Task Requests, Tasks, Surveys, Integration queues
- Admin: Admin, Permission Requests, all administrative functions
```

The backend returns effective navigation and capability states for the current workspace and Managed System context. The frontend must not derive authorization from display labels.

## Capability Matrix

| Capability | User | Developer | Admin |
| --- | --- | --- | --- |
| Create own VOC | yes, no permission request | yes, no permission request | yes, no permission request |
| Read own VOC public status | yes | yes | yes |
| Add Reporter Reply on own VOC | yes | yes | yes |
| Write Public Update | no | same Managed System scope | yes |
| Read all workspace VOC | no | scoped | yes |
| Create Finding | no | scoped | yes |
| Create Task Request | no | scoped | yes |
| Approve Task Request | no | same Managed System scope | yes |
| Self-approve own Task Request | no | explicit scoped capability | yes |
| Create Task directly | no | scoped | yes |
| Read Task internal comments | no | assigned/scoped | yes |
| Create Survey | no | scoped | yes |
| Answer assigned Survey | yes | yes | yes |
| Read personal Survey responses | no | permission required | yes |
| Export data | no | permission required | yes |
| Approve Permission Request | no | no | yes |

Notes:

```text
- scoped means access depends on explicit Managed System, team, or permission scope.
- Managed System scope is the MVP authorization boundary below workspace Admin.
- Access to one Managed System does not grant access to sibling Managed Systems.
- Analytics Area is not an MVP permission boundary.
- Task Request self-approval is a sensitive scoped capability, not an automatic Developer permission.
- Explicit Deny overrides this matrix.
- Source object visibility still applies through entity_links.
```

Permission scope shape:

```text
- workspace_id required
- managed_system_id optional
- team_id optional
- object_type/object_id optional for single-object grants
```

List endpoints for Tasks, Task Requests, Managed Systems, Findings, VOC triage, and Dashboard queues must accept managed_system_id filters where scoped data can appear. Backend responses must exclude objects outside the actor's effective Managed System scopes.

managed_system_id=all means the actor's effective Managed System scope union. Workspace Admin receives true workspace-wide results. A Developer with multiple Managed System scopes receives the union of those scopes. A Developer with one scope receives the same result as that single scope. User-facing views should not expose all as a workspace-wide bypass.

## Default Owner / Reviewer Resolution

When creating VOC, Finding, Task Request, Task, or Survey work tied to a Managed System, the application service resolves default owner or reviewer from:

```text
1. explicit request field when permitted
2. Managed System default owner / reviewer
3. Analytics Area owner team
4. workspace fallback queue
```

The resolved owner or reviewer is written to the actual owner/reviewer field and must be visible in list filters and audit-relevant creation responses. Default owner does not mean the record is triaged, and default reviewer does not mean the record is reviewed. Analytics Area owner team is a routing/defaulting hint only and does not grant Managed System scope. If a resolved owner or reviewer lacks required Managed System scope, the service returns validation_failed or directs the actor to the permission request flow instead of silently granting access. Default resolution should record creation metadata such as default_resolved, source rule, and managed_system_id. Failure to resolve a required reviewer returns validation_failed instead of creating unowned review work.

## Permission Request Data Model

```text
Permission Request
- id
- workspace_id
- requester_id
- requested_permission
- requested_scope
- source_object_type optional
- source_object_id optional
- source_action_id optional
- return_route_intent optional
- reason
- approver_id
- status: pending / needs_more_info / approved / rejected / expired / revoked
- more_info_request optional
- expires_at optional
- created_at
- decided_at
```

## Functional Requirements

### FR-PERM-001: Request Permission

Priority: MUST

Acceptance Criteria:

```text
- User can request Task access, specific Managed System access, Survey creation, Survey personal response access, Export, or Admin permission.
- Permission requests can start from blocked linked objects, blocked next actions, or explicit Admin request flows.
- Inline blocked-state requests must include the blocked object or action, requested scope, reason, and return route intent when available.
- Sensitive permission requests require reason.
- Request can include scope and expiration.
- After approval, the UI should return the requester to the originally blocked object or action when possible.
```

Requester form fields:

```text
- requested permission or capability, prefilled from blocked object/action when possible
- requested scope, prefilled from blocked object/action when possible
- blocked source object/action safe summary when available
- reason, required for sensitive permissions
- requested expiration or duration when supported
```

### FR-PERM-002: Decide Permission Request

Priority: MUST

Acceptance Criteria:

```text
- Admin can approve, reject, revoke, or let permission expire.
- Admin review detail shows requester identity, current role/scope, requested capability, requested scope, source object/action, safe source summary, reason, risk indicators, requested expiration, and explicit deny state.
- Admin can approve as requested, approve narrower scope, approve with expiration, reject, request more info, or revoke existing grants.
- Request more info moves the request to needs_more_info with an Admin question or requested clarification.
- Requester can update reason, requested scope, or requested expiration and resubmit to pending.
- Decision is recorded in Audit Log.
- Approved permissions are scoped when scope is provided.
```

### FR-PERM-003: Enforce Explicit Deny

Priority: MUST

Acceptance Criteria:

```text
- Explicit Deny overrides general Allow.
- Source object visibility is respected when shown through Entity Links.
- Summary-visible links expose only the approved summary contract.
```

## UI / UX Requirements

```text
- Permission Request UI should be a simple request form and admin review queue.
- The user should see why access is blocked and what permission can be requested.
- Blocked linked objects and blocked actions may open inline Permission Request creation when the backend marks the state requestable.
- Requester form and Admin review detail are separate surfaces: requester sees what they are asking for and why; Admin sees the request plus risk, existing access, source context, and decision controls.
- Permission Request is normally an Admin surface or inline blocked-state action, not default navigation for general users.
```

## Cross-System Dependencies

```text
- VOC: Reporter can only see own VOC and public updates.
- Task: Backstage access is restricted.
- Survey: Personal responses and export require explicit permission.
- Entity Links: visibility contract must be enforced.
```

## Out Of Scope For MVP

```text
- Complex permission matrix builder
- Role simulation
- Advanced policy language
```
