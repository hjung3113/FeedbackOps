# Design — 휴먼 display-id 스킴 (#142)

- **Issue:** #142 (Slice 7: Action Dashboard)
- **Date:** 2026-07-10
- **Status:** Approved (brainstorm) → feeds ADR-0029 + implementation plan
- **출처:** Slice-6 release-review Category-B (A1에서 display-id 별도 기능으로 이연)

## 문제

Task / Finding / Cluster / TaskRequest 엔터티는 현재 `uuid` PK만 있고 사람이 읽을 수 있는 식별자가 없다. FE는 raw uuid 또는 임시 shortId를 노출한다(A1에서 부분 완화). 프로토타입은 이미 `TASK-901`, `FIN-179`, `CLU-31`, `REQ-42` 형태를 전제로 한다. VOC는 이미 `display_id`(`VOC-1000+`) + per-workspace 카운터 + SECDEF 함수를 갖고 있어 검증된 선례가 된다.

## 목표 / 비목표

**목표**
- 4개 엔터티에 순차 휴먼 식별자 부여: `TASK-`, `FIN-`, `CLU-`, `REQ-`
- 생성 시 자동 할당 + 기존 로우 백필
- FE가 raw uuid 대신 display-id 노출

**비목표**
- VOC 리팩터링 (이미 동작, 손대지 않음)
- 전역(cross-workspace) 유일 식별자
- display-id 변경/재발급 UI

## 결정 (승인됨)

### 1. 카운터 아키텍처 — 공유 core 테이블 + 단일 함수
VOC의 per-schema 방식을 복제하지 않고, 4개 엔터티에 대해 하나의 공유 카운터를 둔다.

```sql
CREATE TABLE core.display_counters (
  workspace_id uuid NOT NULL,
  entity_type  text NOT NULL,          -- 'task' | 'finding' | 'cluster' | 'task_request'
  next_value   bigint NOT NULL DEFAULT 1000,
  PRIMARY KEY (workspace_id, entity_type)
);

CREATE OR REPLACE FUNCTION core.next_display_id(
  p_workspace_id uuid, p_entity_type text, p_prefix text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_seq bigint;
BEGIN
  INSERT INTO core.display_counters (workspace_id, entity_type)
  VALUES (p_workspace_id, p_entity_type)
  ON CONFLICT (workspace_id, entity_type) DO NOTHING;

  UPDATE core.display_counters
     SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id AND entity_type = p_entity_type
   RETURNING next_value - 1 INTO v_seq;

  RETURN p_prefix || v_seq::text;
END; $$;
```

로직은 VOC `next_voc_display_id`와 동일(upsert → 원자적 +1 → `prefix||seq`). 동시성 안전은 행 단위 `UPDATE ... RETURNING`이 보장(VOC와 동일 검증).

**Trade-off:** VOC의 자체 테이블/함수와 공유 스킴이 공존한다. 허용 — VOC는 스킴 이전 선례이며 ADR에 명기한다. VOC 이관(옵션 3)은 동작하는 shipped 코드를 화장(化粧) 목적으로 건드리는 것이라 YAGNI로 기각.

### 2. 스코프 — per-workspace
카운터 키 = `(workspace_id, entity_type)`. `TASK-1000`은 workspace마다 존재 가능하고 workspace 내에서만 유일. VOC와 동일. FE는 항상 workspace 컨텍스트 안에서 display-id를 보여주므로 모호성 없음.

### 3. 컬럼 / prefix / 시작값
| 엔터티 | 스키마 | prefix | entity_type |
|---|---|---|---|
| Task | `task` | `TASK-` | `task` |
| Finding | `finding` | `FIN-` | `finding` |
| Cluster | `voc_cluster` | `CLU-` | `cluster` |
| TaskRequest | `task_request` | `REQ-` | `task_request` |

- 각 테이블에 `display_id text NOT NULL` + `unique index (workspace_id, display_id)`
- 시작값 1000 (VOC 동일) → `TASK-1000`, `TASK-1001`, …

### 4. 백필
마이그레이션 내에서 workspace별 `created_at ASC, id ASC` 순으로 기존 로우에 순번 할당, 그다음 `core.display_counters.next_value`를 `max(seq)+1`로 세팅 (VOC 0017 백필 방식 그대로). 백필 후 컬럼을 `NOT NULL`로 고정.

### 5. 할당 시점 — repo INSERT
각 모듈 repo의 INSERT 트랜잭션에서 `core.next_display_id(ws, type, prefix)`를 호출해 값을 채운다(VOC `repo.ts` 방식). DB default가 아닌 이유: workspace_id 파라미터가 필요해 app-layer 호출이 자연스럽다. 동일 트랜잭션 내 호출로 카운터-로우 원자성 유지.

### 6. FE 노출
관련 DTO에 `displayId` 추가, 디테일/리스트 행/링크 렌더에서 raw uuid 대신 `displayId` 표기(A1 후속). 링크 참조(예: Finding→Task)도 display-id로 표기.

## 컴포넌트 / 영향 범위

- **DB:** 신규 마이그레이션 1개 (`00NN_display_id_scheme.sql`) — 테이블 + 함수 + 4개 컬럼 + 유니크 인덱스 + 백필 + GRANT (`fops_app`에 SELECT/EXECUTE, VOC 0017 GRANT 참고)
- **Drizzle schema:** `core.ts`에 `displayCounters` 테이블, `task/finding/voc-cluster/task-request.ts`에 `displayId` 컬럼 + 유니크 인덱스
- **Repo:** 4개 모듈 repo INSERT 경로에 `next_display_id` 호출 + 반환 로우 매핑
- **DTO/API:** 4개 엔터티 read 응답에 `displayId`
- **FE:** 디테일/행/링크 컴포넌트가 `displayId` 렌더

## 에러 처리 / 엣지

- 백필 중 non-numeric/seed display-id 없음(신규 컬럼) — VOC처럼 seed 무시 로직 불필요
- 동시 INSERT: 행 단위 UPDATE 락으로 직렬화, 유니크 인덱스가 최종 방어선
- 함수 실패 시 트랜잭션 롤백 → 로우 생성 안 됨(부분 상태 없음)

## 테스트

엔터티별 통합테스트:
1. 생성 시 display-id 할당 + prefix/시퀀스 정확
2. 동일 workspace 연속 생성 시 순번 단조 증가, 유일
3. 서로 다른 workspace 간 동일 순번 허용
4. 백필: 기존 로우가 `created_at` 순으로 번호 부여, 카운터가 max+1
5. 유니크 인덱스 위반 시 에러

## ADR

이 설계는 **ADR-0029 (display-id 스킴)**로 승격 — 구현 첫 커밋에서 `docs/adr/0029-*.md` 생성(AC 1번 항목). VOC 선례 예외를 명기.

## 미해결

없음.
