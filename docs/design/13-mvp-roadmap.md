# MVP Roadmap

## Purpose

This document defines release scope. System documents describe behavior; this document decides when behavior ships.

## Alpha

```text
- Core / AD / Workspace
- 기본 권한
- VOC 등록 / Triage / Inbox
- Managed System Registry and defaults
- Analytics Area Catalog
- Basic Task
- Entity Link
```

## MVP

```text
- Finding
- Task Request
- VOC follow-up to Task Request
- Survey Type 구분
- optional Survey → Finding → Task Request → Task 연결
- VOC 유사 추천
- Action Dashboard 기본형
```

## Phase 1

```text
- VOC Cluster Candidate 자동 생성
- 권한 요청 고도화
- Notification Rule
- Outcome Survey workflow
- Dashboard coverage / unlinked data 고도화
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

## MVP Feature Matrix

```text
Core Platform:
- AD Login: MUST
- Workspace: MUST
- User / Actor: MUST
- Team: MUST
- Basic Role / Permission: MUST
- Permission Request: MUST
- Managed System Registry: MUST
- Analytics Area Catalog: MUST
- Basic Entity Link: MUST
- Basic Audit Log: MUST

VOC:
- VOC 등록: MUST
- 본인 VOC 상태 조회: MUST
- VOC Triage: MUST
- Primary Managed System: MUST
- VOC Source Context: SHOULD
- Unassigned VOC queue: MUST
- 관리자 VOC Inbox: MUST
- VOC Detail: MUST
- 상태 변경: MUST
- Category / Severity: MUST
- Owner / Assignee: MUST
- Analytics Area 연결: SHOULD
- Reporter Reply: MUST
- Public Update: MUST
- VOC Cluster 수동 생성: MUST
- 유사 VOC 추천: SHOULD
- Finding 생성: SHOULD
- Task Request 생성: MUST

Task:
- Backstage 접근 제어: MUST
- Managed System 기반 필터: MUST
- Milestone: SHOULD
- Task 생성 / 수정: MUST
- Task Board / List: MUST
- 담당자 / 기한 / 우선순위: MUST
- Task Request 승인: MUST
- Entity Link support: MUST
- VOC / Survey / Finding 개별 연결: SHOULD

Survey:
- Survey 생성: MUST
- Primary Managed System: MUST
- Survey Type: MUST
- Template 기반 생성: MUST
- 기본 Builder: MUST
- Link 배포: MUST
- 응답 저장: MUST
- Response List: MUST
- 기본 결과 요약: MUST
- Finding 생성: SHOULD
- Task Request / Task 연결: SHOULD
- Analytics Area 연결: SHOULD

Dashboard:
- System Dashboard: MUST
- Action Dashboard: MUST
- 연결된 데이터 조회: MUST
- policy-driven follow-up gap 조회: MUST
- Managed System 현황: MUST
- Analytics Area별 현황: SHOULD when Analytics Area data exists
- Coverage 지표: SHOULD
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
