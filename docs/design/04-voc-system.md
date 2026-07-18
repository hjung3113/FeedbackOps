# VOC System

## Purpose

VOC handles opinions, complaints, requests, questions, and praise directly submitted by internal AD-authenticated Actors.

VOC is the user's or customer's voice as submitted inside the company. Survey analysis does not create new VOC.

## Boundary

Owns:

```text
- VOC
- VOC Triage
- VOC Inbox
- VOC Cluster
- Reporter-facing VOC Status
- Public Update
- Reporter Reply
- Internal Comment
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
- VOC Triage
- VOC Inbox
- VOC Cluster
- Similar VOC Recommendation
- Reporter-facing VOC Status
- Public Update
- Reporter Reply
- Internal Comment
```

## Definition

```text
VOC = 내부 AD 인증 Actor가 직접 제출한 고객 또는 사용자 의견, 불만, 요청, 질문, 칭찬
```

Reporter is the Actor who submitted a specific VOC. Reporter is not a Role Level, persona, or external customer contact in MVP.

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

Reporter-facing VOC Status changes:

```text
- Only workspace Admin or Developer within the same Managed System Permission Scope can change Reporter-facing VOC Status.
- Status changes happen through an explicit Public Update flow or an explicit reporter-status review action.
- Task Done, Task Released, Reporter Reply, and cluster bulk update candidates must not automatically change Reporter-facing VOC Status.
- Changing Reporter-facing VOC Status should prompt review of whether a Public Update is needed.
- The default status-change UI opens Public Update composition.
- Changing status without Public Update is allowed only with an explicit skip reason, such as correcting an accidental status or avoiding duplicate communication after a recent Public Update.
- Every Reporter-facing VOC Status change is a per-VOC decision and must be audited.
- MVP does not allow direct bulk Reporter-facing VOC Status update. Bulk or
  cluster flows may generate candidates and copy draft message content, but each
  selected VOC must still be reviewed and applied as a separate audited decision.
- New Survey evidence may be attached to a VOC whose Reporter-facing VOC Status
  is Closed, when policy and permissions allow it. Attachment must not
  automatically reopen or change Reporter-facing VOC Status; the API should
  provide `review_reporter_status` or `write_public_update` as follow-up
  candidates when communication may be needed.
```

## Triage And Ownership

VOC Triage is a primary VOC workspace, not only an Inbox filter.

VOC Inbox and VOC Triage are separate workspace views under the same VOC route
family:

```text
- VOC Inbox is for open-processing work: newly submitted VOCs, recently updated VOCs, Reporter Replies, waiting reporter follow-up, and other items that need quick handling.
- VOC Triage is for structured decisions: owner, severity, category, Analytics Area, similar VOC, follow-up path, public update, and no-follow-up decisions.
- Both views use list-first scanning and VOC Detail inspection.
- Triage must not be reduced to an Inbox filter because it owns decisions that change classification, ownership, routing, and follow-up state.
```

VOC triage state:

```text
- Untriaged
- Triaged
- Needs More Information
- Dismissed / Not Actionable
```

VOC ownership state:

```text
- Unassigned
- Assigned to User
- Assigned to Team
```

New VOC starts Untriaged. It is Unassigned only when no explicit owner or default owner rule resolves ownership. When a default owner rule applies, the actual owner field is prefilled and the VOC is assigned but still Untriaged. Triage, owner assignment, reporter-facing status, Finding creation, and Task Request creation are separate decisions.

Every VOC must have exactly one Primary Managed System. Analytics Area is optional and can only be selected from the chosen Primary Managed System.

VOC Source Context is optional and defaults to Direct Use:

```text
- Direct Use
- Proxy Report
- Operational Discovery
- Stakeholder Request
```

MVP does not track a separate affected_user field. When Source Context is Proxy Report, the VOC form should prompt the Reporter to describe who or which team they are reporting for and the situation they observed. Proxy or multi-system context belongs in the VOC description, tags, separate linked records, or entity links.

## Key Workflows

### WF-VOC-001: VOC Triage And Ownership

```text
VOC
→ Unassigned / Untriaged
→ Assign owner or team
→ Classify severity, category, Analytics Area
→ Decide public update, Finding, Task Request, cluster, or no follow-up
```

### WF-VOC-002: Optional VOC To Execution

```text
VOC
→ optional VOC Cluster
→ optional Finding
→ optional Task Request
→ reviewed conversion to Task
→ optional Reporter-facing Update
```

VOC may bypass Finding when the follow-up action is clear from a single VOC.
Create Finding first when multiple evidence sources, VOC Clusters, Survey
results, or explicit analysis must be summarized before execution. High
Severity alone does not force Finding, but High Severity plus unclear scope,
impact, confidence, or root cause should prompt Finding synthesis before Task
Request.

### WF-VOC-003: Similar VOC Recommendation

```text
VOC text preprocessing
→ Embedding generation
→ Similarity Top N recommendation
→ Admin or same-scope Developer confirms Cluster
```

## Functional Requirements

### FR-VOC-001: Create VOC

Priority: MUST

Acceptance Criteria:

```text
- Reporter can create VOC without Task access.
- Any AD-authenticated Actor can create their own VOC without a Permission Request.
- Admin, Developer, and User can all create VOC.
- VOC requires one Primary Managed System.
- Reporter may optionally select Analytics Area only under the chosen Primary Managed System.
- Created VOC starts as "접수됨".
- Created VOC appears in VOC Triage under Untriaged. It appears under Unassigned only when no explicit or default owner resolves ownership.
- Reporter can edit title, description, and attachments only before triage starts.
- Severity is not collected from Reporter at creation.
- Audit log records creation.
```

### FR-VOC-002: Manage VOC Triage

Priority: MUST

Acceptance Criteria:

```text
- Admin and same-scope Developer can view Unassigned, Untriaged, High Severity, Waiting Reporter, Similar VOC Suggested, Linked to Finding, and No Follow-up views.
- Admin and same-scope Developer can assign owner or team directly from the list.
- Unassigned can be filtered by Managed System and Analytics Area.
- Admin and same-scope Developer can set severity, owner, category, Analytics Area, and Reporter-facing Status.
- Admin and same-scope Developer can create Finding or Task Request from VOC when appropriate.
- Reporter Reply on a Waiting Reporter VOC reactivates the internal queue without automatically changing Reporter-facing VOC Status.
```

### FR-VOC-003: VOC Cluster

Priority: MUST

Acceptance Criteria:

```text
- Admin and same-scope Developer can manually create clusters, add/remove VOCs, and confirm clusters.
- Cluster can link duplicate, similar_issue, same_root_cause, or same_feature_area VOCs.
- Cluster can create Finding.
- Cluster is not a reporter-visible object in MVP.
- Cluster membership changes are audited.
- Cluster does not merge VOC records; each VOC remains an independent record.
- Cluster public update behavior is candidate-only; applying a candidate creates separate Public Update records on selected VOCs.
```

### FR-VOC-004: Similar VOC Recommendation

Priority: SHOULD

Acceptance Criteria:

```text
- System recommends similar VOCs using embedding similarity.
- Recommendation does not auto-cluster without authorized confirmation.
- Recommended matches can be dismissed.
```

> **Implementation status (2026-07-15).** NOT satisfied. The shipped
> "similar VOC" surface (#141, ADR-0031) is a same-Managed-System peer
> heuristic — no embedding similarity, no dismissal state. A #127 ARCHITECT
> audit at develop `68f121e` confirmed no embedding/vector infrastructure
> exists. Full satisfaction of this requirement is tracked by epic **#168**;
> ADR-0031 has been amended to re-assign it there (it previously pointed at
> #127, which is a UI slice and does not deliver similarity infrastructure).
> The second criterion is already honoured: #127 does not auto-cluster —
> recommendations stay a separate resource requiring authorized confirmation
> (#127 decision D1).

### FR-VOC-005: Public Update

Priority: MUST

Acceptance Criteria:

```text
- Internal comments and public reporter updates are separated.
- Public Updates can be written by Admin or same-scope Developer.
- User cannot write Public Updates.
- Reporter can add Reporter Replies to their own VOC.
- Reporter Replies and Public Updates appear in the public VOC timeline.
- Internal Comments appear in a separate internal timeline.
- MVP conversation is append-only and not real-time chat.
- Reporter-facing updates can be written when status changes.
- Cluster-linked reporters can receive a bulk update candidate, but MVP does not auto-send cluster updates.
- Reporter-facing status changes remain explicit per-VOC decisions.
```

## UI / UX Requirements

### VOC Row Status Signals

VOC list rows may show multiple state signals at the same time, but they must
not imply that all states are one workflow.

```text
- Reporter-facing VOC Status: public progress visible to the Reporter.
- VOC Triage State: internal processing state for classification, follow-up, and review.
- Ownership State: whether the VOC is unassigned, user-assigned, or team-assigned.
- Linked Execution Signal: whether the VOC has linked Finding, Task Request, Task, or an explicit no-follow-up-needed decision.
```

Reporter-facing VOC Status and VOC Triage State must be visually separated.
Reporter-facing status is public progress; triage state is internal workflow.

### VOC Triage

Purpose:

```text
새 VOC를 빠르게 소유자에게 할당하고, 분류와 후속 흐름을 결정한다.
```

Views:

```text
- Unassigned
- Untriaged
- High Severity
- Waiting Reporter
- Similar VOC Suggested
- Linked to Finding
- No Follow-up
```

Quick Actions:

```text
- Set Severity
- Assign Owner
- Assign Team
- Link Analytics Area
- Add to Cluster
- Create Finding
- Request Task
- Write Public Update
```

Rich content surfaces:

```text
- VOC description
- Reporter Reply
- Public Update
- Internal Comment
```

All rich content surfaces use a WYSIWYG-first editor. Markdown or HTML may be internal formats or optional shortcuts, but users must not be required to write markup. Inline images are uploaded attachments displayed inline; base64 body images and external inline image URLs are not allowed in MVP. Rich Table support is spike-gated; large spreadsheets should be attachments.

### VOC Inbox

Purpose:

```text
열려 있는 VOC를 Zendesk / Intercom 스타일로 처리한다.
```

Views:

```text
- All open
- Assigned to me
- My team
- Recently updated
- Closed
```

## Permissions

```text
- Reporter can create VOC.
- Reporter can read their own VOC, public updates, and Reporter Summary.
- Reporter cannot see raw Task Status, internal comments, priorities, dev discussion, severity, or confidence through linked work.
- Admin can read and manage VOC in workspace.
- Developer can read and manage VOC within their Managed System scope.
- Basic User cannot read Task internal comments through VOC links.
```

## Cross-System Dependencies

```text
- Analytics Area from 03-core-platform.md
- Finding from 05-finding-insight-system.md
- Task Request from 06-task-project-system.md
- Entity Link from 11-entity-linking.md
- Public status separation from 10-cross-system-workflows.md
```

## Out Of Scope For MVP

```text
- Fully automatic clustering
- Cluster merge / split
- Omnichannel chat
- Help Center / Knowledge Base
- Auto-task creation
- External/customer-contact login
- affected_user field
- Per-Managed System workflow customization
```
