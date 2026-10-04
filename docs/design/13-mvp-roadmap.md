# MVP Roadmap

## Purpose

This document defines release scope. System documents describe behavior; this document decides when behavior ships.

Implementation slice status is the GitHub milestones on `hjung3113/FeedbackOps`.
This document groups release scope and includes short shipped/open notes for partially delivered items. It is not an execution queue.

## Phase 1

```text
- VOC Cluster Candidate 자동 생성 (shadow measurement shipped; unattended cluster writes remain open per ADR-0054)
- 권한 요청 고도화 (needs_more_info supplement shipped in #511; requester cancel / pending edit undecided, see `docs/research/permission-request-cancel-edit.md`; admin revoke of an active grant/deny, direct grant without a request, and risk scoring are not built)
- Dashboard coverage / unlinked data 고도화 (coverage fixes + page shipped in #513; editable thresholds deferred)
- Analytics Area별 리포트
```

## Phase 2

```text
- 자동 요약
- root cause 후보
- priority score
- advanced clustering
- 외부 도구 연동
- 고급 Audit / Export
- Executive Report
```

## MVP Success Flow

Recommended first success path:

```text
1. 일반 사용자가 Managed System을 선택해 VOC를 등록한다.
2. Admin 또는 same-scope Developer가 VOC Inbox에서 분류하고 severity를 지정한다.
3. 유사 VOC를 묶어 VOC Cluster를 만든다.
4. Cluster에서 Finding을 만든다.
5. Finding에서 Task Request를 만든다.
6. Admin 또는 same-scope Developer가 Task Request를 승인해 Backlog Task를 만든다.
7. Task 상태와 별도로 Reporter-facing VOC Status를 수동 갱신한다.
8. Action Dashboard에서 High Severity VOC의 Finding / Task Request / Task / no-follow-up decision 여부를 추적한다.
```

## Explicit MVP Exclusions

```text
- Survey Response → VOC conversion
- full automatic clustering
- custom workflow builder
- public roadmap / voting portal
- advanced BI
- complex survey logic
- advanced permission policy language
- external tool integrations
- external/customer-contact login
- per-Managed System workflow customization
- Analytics Area permission boundaries
- affected_user field
- raw Markdown/HTML-only rich content input
```
