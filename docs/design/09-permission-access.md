# Permission / Access System

## Purpose

Permission / Access controls who can see internal work, survey responses, exports, and admin functions.

Default access should be low after AD login.

This file owns permission UX and what each role can do, including the default user and the capability matrix.
Check order and audit event verbs live in docs/implementation/05-permission-policy.md. Do not copy them here.

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

Role Level order is Admin > Developer > User. Reporter is not a role; it is the Actor who submitted a specific VOC. Adding a fourth Role Level is not a matrix-cell edit; the wiring is `docs/adr/0048-role-level-extension.md`.

## Default User Can

```text
- VOC 작성 without a permission request
- 본인 VOC 상태 확인
- 열려 있는 Survey 응답
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

User submits and sees their own allowed work. Developer works inside granted Managed System scopes. Admin runs workspace administration. The matrix below is the action grid.

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
| Create Task directly (not built, ADR-0027; data shape valid) | no | scoped | yes |
| Read Task internal comments | no | `finding.manage` on that Task's Managed System | yes |
| Create Survey | no | scoped | yes |
| Answer open Survey | yes | yes | yes |
| Read personal Survey responses | no | permission required | no — explicit capability required |
| Export Survey data (`survey.export`) | no | permission required | permission required |
| Approve Permission Request | no | no | yes |

Notes:

```text
- scoped means access depends on explicit Managed System permission scope; team and single-object authorization are outside MVP (ADR-0066).
- Managed System scope is the MVP authorization boundary below workspace Admin.
- Access to one Managed System does not grant access to sibling Managed Systems.
- Analytics Area is not an MVP permission boundary.
- Task Request self-approval is a sensitive scoped capability, not an automatic Developer permission.
- Task internal comments are progress notes (`docs/adr/0049-finding-task-progress-notes.md`). Reading them is not "assigned". It is Admin, or Developer with `finding.manage` on that Task's Managed System. A User is denied before grants are consulted. Finding progress notes are a different gate: read is Admin or Developer with `finding.read` (a User is denied before grants, even with `finding.read`); write is `finding.manage`, and an explicit grant is enough for a User.
- Explicit Deny overrides this matrix.
- Source object visibility still applies through entity_links.
```

Permission scope shape:

```text
- workspace_id required
- managed_system_id optional
- team and single-object authorization are not supported in MVP (ADR-0066)
- source_object_type/source_object_id identify provenance, not grant scope
```

List endpoints for Tasks, Task Requests, Managed Systems, Findings, VOC triage, and Dashboard queues must accept managed_system_id filters where scoped data can appear. Backend responses must exclude objects outside the actor's effective Managed System scopes.

List-filter meaning of managed_system_id=all: docs/implementation/05-permission-policy.md, Permission Check Order.

## Default Owner / Reviewer Resolution

Deferred except the Survey operator default (ADR-0059 D1). The rules below are the target design.

When creating VOC, Finding, Task Request, Task, or Survey work tied to a Managed System, the application service resolves default owner or reviewer from:

```text
1. explicit request field when permitted
2. Managed System default owner / reviewer
3. Analytics Area owner team
4. workspace fallback queue
```

The resolved owner or reviewer is written to the actual owner/reviewer field and must be visible in list filters and audit-relevant creation responses. Default owner does not mean the record is triaged, and default reviewer does not mean the record is reviewed. Analytics Area owner team is a routing/defaulting hint only and does not grant Managed System scope. If a resolved owner or reviewer lacks required Managed System scope, the service returns validation.failed or directs the actor to the permission request flow instead of silently granting access. Default resolution should record creation metadata such as default_resolved, source rule, and managed_system_id. Failure to resolve a required reviewer returns validation.failed instead of creating unowned review work.

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
- status: pending / needs_more_info / approved / rejected / expired / revoked / cancelled
- revision: positive integer, advances on every successful mutation (proposed/new, ADR-0066)
- more_info_request optional
- expires_at optional
- created_at
- decided_at
```

This is the conceptual shape. Stored columns are in `15-data-contracts.md`; the approver, decision time, and an Admin's more-info note are recorded on the audit event, not as columns on the request.

## Functional Requirements

### FR-PERM-001: Request Permission

Priority: MUST

Acceptance Criteria:

```text
- User can request supported Task/Managed System access, Survey creation, Survey personal response access, or Export. Workspace administrative capability is granted only through explicit Admin direct-grant governance, never an ordinary blocked-action ask (ADR-0066).
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
- Admin can approve as requested, narrow a server-supported workspace scope to one valid Managed System, override granted expiration, reject, request more info, or revoke existing grants. A system scope cannot widen or move to a sibling; workspace-only authority cannot become fictitious system authority. Requested scope/expiry stay unchanged; response and audit distinguish granted values (ADR-0066).
- Request more info moves the request to needs_more_info with an Admin question or requested clarification.
- Requester can edit reason, supported scope, or optional expiration on the same pending ask, or supplement needs_more_info back to pending; capability/source/return intent remain immutable.
- Only the requester can withdraw pending or needs_more_info to cancelled with an optional reason; history stays and no grant/deny is created.
- Edit, withdrawal, supplementation and Admin decisions require the reviewed revision; stale writes require a refresh and new review, never auto-submit (ADR-0066).
- Decision is recorded in Audit Log.
- Approved permissions are scoped when scope is provided.
```

Reopened and reconciled 2026-10-13 by ADR-0066 (owner #1041): supported-scope narrowing replaces the old policy prohibition; single-object enforcement is deferred. New lifecycle/read/direct-grant behavior is accepted, not implemented by this docs change.

Status (ADR-0061, 2026-10-05): grant revocation and deny lifting ship with the
Admin "활성 권한" screen in #762.

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

## MVP close-out review and direct grant (ADR-0066; proposed/new)

Home's own open requests provide `수정`, `요청 철회`, and `보완 제출` only as allowed
by owner-scoped detail. Withdrawal retains history; closing a form does not withdraw.
Admin history includes `cancelled` with no decision controls.

Admin selected review shows current role/effective access and four explained server
signals under `검토 시 확인할 사항`: sensitive capability, workspace-wide scope,
no expiration, and overlapping active deny. No numeric risk/role-jump score.
`추가 확인 사항 없음` means successful computation with no signals; failure offers
retry. No requester risk/deny internals, email, or restricted Survey data.

The existing `활성 권한` screen gains `권한 부여`, with workspace Actor names,
server-supported capability/scope choices, required reason, and optional expiration.
`workspace.admin` requires explicit governance mode and confirmation; direct self
grant follows `permission_self_approval`, including the strict self envelope when
allowed. Matching open asks lead to review; overlapping denies require explicit
lift. Server validation repeats preflight checks. Grants do not promote Role Level.
Expired grant reissue preserves history and creates a new grant ID. Full API and
scope/error rules live in `docs/implementation/api/permissions.md` and `05-permission-policy.md`.
