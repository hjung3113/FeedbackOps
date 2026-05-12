# VOC System

## Purpose

VOC handles opinions, complaints, requests, questions, and praise directly submitted by customers or users.

VOC is the user's voice. Survey analysis does not create new VOC.

## Boundary

Owns:

```text
- VOC
- VOC Inbox
- VOC Cluster
- Reporter-facing VOC Status
- Public Update
```

Does not own:

```text
- Survey Response
- Finding evidence model
- Task backlog
- Task internal status
- Permission approval
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
```

## Core Concepts

```text
- VOC
- VOC Inbox
- VOC Cluster
- Similar VOC Recommendation
- Reporter-facing VOC Status
- Public Update
- Internal Comment
```

## Definition

```text
VOC = 고객/사용자가 직접 제기한 의견, 불만, 요청, 질문, 칭찬
```

## Status Model

Reporter-facing VOC Status:

```text
- 접수됨
- 검토 중
- 담당자 배정됨
- 처리 중
- 해결 준비 중
- 해결됨
- 다시 처리 중
- 종료됨
```

Important rule:

```text
Task Done은 고객 문제가 해결되었다는 뜻이 아니다.
Released 또는 고객 노출 확인 이후에만 해결됨으로 볼 수 있다.
```

## Key Workflows

### WF-VOC-001: VOC To Finding To Task Request

```text
VOC
→ VOC Cluster optional
→ Finding
→ Task Request
→ Task
→ Reporter-facing Update
```

### WF-VOC-002: Similar VOC Recommendation

```text
VOC text preprocessing
→ Embedding generation
→ Similarity Top N recommendation
→ Manager confirms Cluster
```

## Functional Requirements

### FR-VOC-001: Create VOC

Priority: MUST

Acceptance Criteria:

```text
- Reporter can create VOC without Task access.
- Created VOC starts as "접수됨".
- Created VOC appears in Admin VOC Inbox under Untriaged.
- Product Area is optional.
- Audit log records creation.
```

### FR-VOC-002: Manage VOC Inbox

Priority: MUST

Acceptance Criteria:

```text
- Managers can view Untriaged, High Severity, Needs Owner, Waiting Reporter, Similar VOC Suggested, Linked to Finding, and No Follow-up views.
- Managers can set severity, owner, category, Product Area, and Reporter-facing Status.
- Managers can create Finding or Task Request from VOC.
```

### FR-VOC-003: VOC Cluster

Priority: MUST

Acceptance Criteria:

```text
- Managers can manually create, merge, split, and confirm clusters.
- Cluster can link duplicate, similar_issue, same_root_cause, or same_feature_area VOCs.
- Cluster can create Finding.
```

### FR-VOC-004: Similar VOC Recommendation

Priority: SHOULD

Acceptance Criteria:

```text
- System recommends similar VOCs using embedding similarity.
- Recommendation does not auto-cluster without manager confirmation.
- Recommended matches can be dismissed.
```

### FR-VOC-005: Public Update

Priority: MUST

Acceptance Criteria:

```text
- Internal comments and public reporter updates are separated.
- Reporter-facing updates can be written when status changes.
- Cluster-linked reporters can receive a bulk update candidate.
```

## UI / UX Requirements

### VOC Inbox

Purpose:

```text
새 VOC를 빠르게 분류하고, 담당자와 후속 흐름을 결정한다.
```

Views:

```text
- Untriaged
- High Severity
- Needs Owner
- Waiting Reporter
- Similar VOC Suggested
- Linked to Finding
- No Follow-up
```

Quick Actions:

```text
- Set Severity
- Assign Owner
- Link Product Area
- Add to Cluster
- Create Finding
- Request Task
- Write Public Update
```

## Permissions

```text
- Reporter can create VOC.
- Reporter can read their own VOC and public updates.
- Manager can read and manage VOC in workspace.
- Basic User cannot read Task internal comments through VOC links.
```

## Cross-System Dependencies

```text
- Product Area from 03-core-platform.md
- Finding from 05-finding-insight-system.md
- Task Request from 06-task-project-system.md
- Entity Link from 11-entity-linking.md
- Public status separation from 10-cross-system-workflows.md
```

## Out Of Scope For MVP

```text
- Fully automatic clustering
- Omnichannel chat
- Help Center / Knowledge Base
- Auto-task creation
```
