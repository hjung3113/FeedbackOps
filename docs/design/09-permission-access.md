# Permission / Access System

## Purpose

Permission / Access controls who can see customer data, internal work, survey responses, exports, and admin functions.

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
→ 기본 Role Level: User / Reporter / Viewer 수준
→ 민감 기능과 Backstage 접근은 기본 차단
```

## Default User Can

```text
- VOC 작성
- 본인 VOC 상태 확인
- 본인에게 할당된 Survey 응답
- 공개 또는 허용된 Dashboard 일부 조회 optional
```

## Default User Cannot

```text
- Task 내부 댓글 조회
- Project Backstage 접근
- Survey 개인 응답 조회
- 고객 민감정보 조회
- Export
- Role / Permission 변경
```

## Capability Matrix

| Capability | Reporter / Basic User | Contributor | Manager / PM | Admin |
| --- | --- | --- | --- | --- |
| Create own VOC | yes | yes | yes | yes |
| Read own VOC public status | yes | yes | yes | yes |
| Read all workspace VOC | no | scoped | yes | yes |
| Create Finding | no | scoped | yes | yes |
| Create Task Request | no | yes | yes | yes |
| Approve Task Request | no | no | yes | yes |
| Create Task directly | no | no | yes | yes |
| Read Task internal comments | no | assigned/scoped | yes | yes |
| Create Survey | no | scoped | yes | yes |
| Answer assigned Survey | yes | yes | yes | yes |
| Read personal Survey responses | no | no | permission required | yes |
| Export data | no | no | permission required | yes |
| Approve Permission Request | no | no | no | yes |

Notes:

```text
- scoped means access depends on explicit project, team, or permission scope.
- Explicit Deny overrides this matrix.
- Source object visibility still applies through entity_links.
```

## Permission Request Data Model

```text
Permission Request
- id
- workspace_id
- requester_id
- requested_permission
- requested_scope
- reason
- approver_id
- status: pending / approved / rejected / expired / revoked
- expires_at optional
- created_at
- decided_at
```

## Functional Requirements

### FR-PERM-001: Request Permission

Priority: MUST

Acceptance Criteria:

```text
- User can request Task / Project access, specific Project access, Survey creation, Survey personal response access, Export, or Admin permission.
- Sensitive permission requests require reason.
- Request can include scope and expiration.
```

### FR-PERM-002: Decide Permission Request

Priority: MUST

Acceptance Criteria:

```text
- Admin can approve, reject, revoke, or let permission expire.
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
- Admin review should show requester, scope, reason, risk, and expiration.
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
