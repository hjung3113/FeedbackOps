# Design — 휴먼 display-id 스킴 (#142)

- **Issue:** #142 (Slice 7: Action Dashboard)
- **Date:** 2026-07-10
- **Status:** Approved (brainstorm) + codex 적대적 리뷰 반영(v2) → feeds ADR-0029 + implementation plan
- **Review:** `.review/DISPLAY-ID-SPEC-REVIEW.json` (codex, verdict NEEDS_REVISION, 7 findings 전부 반영)
- **출처:** Slice-6 release-review Category-B (A1에서 display-id 별도 기능으로 이연)

## 문제

Task / Finding / Cluster / TaskRequest 엔터티는 현재 `uuid` PK만 있고 사람이 읽을 수 있는 식별자가 없다. FE는 raw uuid 또는 임시 shortId를 노출한다(A1에서 부분 완화). 프로토타입은 이미 `TASK-901`, `FIN-179`, `CLU-31`, `REQ-42` 형태를 전제로 한다. VOC는 이미 `display_id`(`VOC-1000+`) + per-workspace 카운터 + SECDEF 함수를 갖고 있어 검증된 선례가 된다.

## 목표 / 비목표

**목표**
- 4개 엔터티에 순차 휴먼 식별자 부여: `TASK-`, `FIN-`, `CLU-`, `REQ-`
- 생성 시 자동 할당 + 기존 로우 백필
- FE가 raw uuid 대신 display-id 노출 (엔터티-링크 참조 포함)

**비목표**
- VOC 리팩터링 (이미 동작, 손대지 않음)
- 전역(cross-workspace) 유일 식별자
- display-id 변경/재발급 UI

## 결정 (승인 + 리뷰 반영)

### 1. 카운터 아키텍처 — 공유 core 테이블 + 단일 함수
VOC의 per-schema 방식을 복제하지 않고, 4개 엔터티에 대해 하나의 공유 카운터를 둔다.
**리뷰 반영(F3):** `entity_type`에 CHECK 제약, prefix는 함수 내부에서 매핑(외부 `p_prefix` 파라미터 제거) → 오타로 별도 카운터 스트림/잘못된 prefix 생성 방지.
**리뷰 반영(F7):** 함수 소유자를 `fops_migrate`로 고정(migration 0008 선례).

```sql
CREATE TABLE core.display_counters (
  workspace_id uuid NOT NULL,
  entity_type  text NOT NULL,
  next_value   bigint NOT NULL DEFAULT 1000,
  PRIMARY KEY (workspace_id, entity_type),
  CONSTRAINT display_counters_entity_type_chk
    CHECK (entity_type IN ('task','finding','cluster','task_request'))
);

CREATE OR REPLACE FUNCTION core.next_display_id(
  p_workspace_id uuid, p_entity_type text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_seq bigint; v_prefix text;
BEGIN
  v_prefix := CASE p_entity_type
    WHEN 'task'         THEN 'TASK-'
    WHEN 'finding'      THEN 'FIN-'
    WHEN 'cluster'      THEN 'CLU-'
    WHEN 'task_request' THEN 'REQ-'
    ELSE NULL END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'unknown entity_type: %', p_entity_type;
  END IF;

  INSERT INTO core.display_counters (workspace_id, entity_type)
  VALUES (p_workspace_id, p_entity_type)
  ON CONFLICT (workspace_id, entity_type) DO NOTHING;

  UPDATE core.display_counters
     SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id AND entity_type = p_entity_type
   RETURNING next_value - 1 INTO v_seq;

  RETURN v_prefix || v_seq::text;
END; $$;

ALTER FUNCTION core.next_display_id(uuid, text) OWNER TO fops_migrate;
GRANT EXECUTE ON FUNCTION core.next_display_id(uuid, text) TO fops_app;
GRANT SELECT ON core.display_counters TO fops_app;
```

동시성 안전: `UPDATE ... RETURNING`이 갱신 행(PK)에 락을 잡아 동일 `(workspace, entity_type)` 동시 INSERT를 직렬화(VOC 선례로 검증됨, 리뷰 checklist 1 confirmed).

**Trade-off:** VOC의 자체 테이블/함수와 공유 스킴이 공존한다. 허용 — VOC는 스킴 이전 선례이며 ADR에 명기(리뷰 checklist 10 confirmed: VOC는 `voc.*`에 격리). VOC 이관은 동작하는 shipped 코드를 화장 목적으로 건드리는 것이라 YAGNI로 기각.

### 2. 스코프 — per-workspace
카운터 키 = `(workspace_id, entity_type)`. `TASK-1000`은 workspace마다 존재 가능하고 workspace 내에서만 유일. VOC와 동일. FE는 항상 workspace 컨텍스트 안에서 display-id를 보여주므로 모호성 없음.

### 3. 컬럼 / prefix / 시작값
| 엔터티 | 스키마 | prefix | entity_type |
|---|---|---|---|
| Task | `task` | `TASK-` | `task` |
| Finding | `finding` | `FIN-` | `finding` |
| Cluster | `voc_cluster` | `CLU-` | `cluster` |
| TaskRequest | `task_request` | `REQ-` | `task_request` |

- 각 테이블에 `display_id text NOT NULL` + `unique index (workspace_id, display_id)` (non-partial, VOC 0010 동일 shape — 리뷰 checklist 7 confirmed)
- 시작값 1000 (VOC 동일) → `TASK-1000`, `TASK-1001`, …

### 4. 백필 (리뷰 반영 F6 — VOC와 다른 알고리즘)
VOC 0017은 **기존 display_id에서 카운터를 seed**했다(이미 값이 있었음). 신규 컬럼은 값이 없으므로 다른 알고리즘 필요:
1. workspace별 `row_number() over (partition by workspace_id order by created_at ASC, id ASC)` 로 순번 계산, `display_id = prefix || (999 + row_number)` 할당 (첫 로우 = 1000)
2. `core.display_counters.next_value = 1000 + count(rows per workspace)` 로 seed (다음 생성이 기존 최대와 충돌 안 하도록)
3. 백필 완료 후 컬럼을 `SET NOT NULL`

모든 대상 테이블에 `created_at NOT NULL` 존재 확인됨(리뷰 checklist 3: finding/cluster/task_request/task 마이그레이션·스키마 근거). **대용량 테이블 락/다운타임 주의** — 마이그레이션에 배치/lock 코멘트 명기.

### 5. 할당 시점 — repo INSERT
각 모듈 repo의 INSERT 트랜잭션에서 `core.next_display_id(ws, type)`를 호출해 값을 채운다(VOC `repo.ts:386-391` 방식). DB default가 아닌 이유: workspace_id 파라미터 필요 → app-layer 호출. 동일 트랜잭션 내 호출로 카운터-로우 원자성 유지.

### 6. FE / DTO 노출 (리뷰 반영 F2, F5)
- **필드명 = `display_id` (snake_case)** — VOC shared DTO(`packages/shared/src/vocs/list-item.ts:40`) 및 기존 strict zod 계약과 일치. Drizzle/TS 내부 프로퍼티는 `displayId`로 매핑 가능하나 API 표면은 snake_case.
- 4개 엔터티 read DTO(`packages/shared/src/{tasks,findings,...}`)에 `display_id: z.string()` 추가 + service mapper 갱신.
- FE 디테일/리스트 행에서 raw uuid 대신 `display_id` 렌더.
- **엔터티-링크 참조도 포함(F5):** `apps/backend/src/modules/entity-links/service.ts`의 summary provider가 지원 타입(finding/task/task_request/cluster) 행에 `display_id`를 반환하도록 확장, `packages/shared/src/entity-links.ts` ref/summary DTO에 `display_id` 추가, FE 링크 렌더가 이를 표기. (그러지 않으면 링크에서 uuid가 계속 새어 A1 후속 목표 미완.)

## 컴포넌트 / 영향 범위 (리뷰로 확장)

- **DB:** 신규 raw SQL 마이그레이션 1개 (`00NN_display_id_scheme.sql`) — 이 repo는 손으로 쓴 번호 .sql 마이그레이션 규약(0000–0026). 테이블+CHECK, 함수(OWNER `fops_migrate`), 4개 컬럼, 유니크 인덱스, row_number 백필, SET NOT NULL, GRANT.
- **Drizzle config (F1 — blocker):** `apps/backend/drizzle.config.ts`의 `schema` 배열과 `schemaFilter`에 `task`, `task_request` 추가(현재 누락 → drift 미검출). db:generate/db:check 신뢰 전에 선행.
- **Drizzle schema:** `core.ts`에 `displayCounters`, `task/finding/voc-cluster/task-request.ts`에 `displayId` 컬럼 + 유니크 인덱스.
- **Repo:** 4개 모듈 repo INSERT 경로에 `next_display_id` 호출 + 반환 로우 매핑.
- **DTO/API:** 4개 엔터티 read DTO + entity-link ref/summary DTO에 `display_id`.
- **Entity-link service:** summary provider가 display_id 반환(F5).
- **테스트 seed 사이트 (F4 — major):** 아래 raw SQL INSERT가 NOT NULL 위반 → 공유 seed 헬퍼로 `next_display_id` 경유하도록 갱신(VOC `__tests__/_seed-helpers.ts` 선례):
  - `apps/backend/src/modules/tasks/__tests__/task-detail-and-finding-link.integration.test.ts:139-187`
  - `apps/backend/src/modules/task-requests/__tests__/voc-request-task.integration.test.ts:156-162`
  - `apps/backend/src/modules/entity-links/__tests__/entity-links.integration.test.ts:183`
  - `apps/backend/src/modules/findings/__tests__/evidence-highlights.integration.test.ts:150`
  - `apps/backend/src/modules/tasks/__tests__/task-conversion.integration.test.ts:151,176,212`
  - (구현 시 `rg`로 4개 테이블 direct INSERT 재확인 후 목록 확정)
- **FE:** 디테일/행/링크 컴포넌트가 `display_id` 렌더.

## 에러 처리 / 엣지

- 함수: unknown entity_type → RAISE EXCEPTION(F3), 트랜잭션 롤백.
- 동시 INSERT: 행 단위 UPDATE 락으로 직렬화, 유니크 인덱스가 최종 방어선.
- 함수 실패 시 트랜잭션 롤백 → 로우 생성 안 됨(부분 상태 없음).
- 백필: workspace에 로우 0개면 카운터는 default 1000 유지(count=0 → next_value=1000).

## 테스트

엔터티별 통합테스트:
1. 생성 시 display-id 할당 + prefix/시퀀스 정확
2. 동일 workspace 연속 생성 시 순번 단조 증가, 유일
3. 서로 다른 workspace 간 동일 순번 허용
4. 백필: 기존 로우가 `created_at, id` 순으로 1000부터 번호 부여, 카운터 = 1000+count
5. 유니크 인덱스 위반 시 에러
6. unknown entity_type → 함수 예외
7. 엔터티-링크 summary에 display_id 포함(F5)
8. drift 체크: `pnpm --filter backend db:check` 가 task/task_request 포함해 통과(F1)

## ADR

이 설계는 **ADR-0029 (display-id 스킴)**로 승격 — 구현 첫 커밋에서 `docs/adr/0029-*.md` 생성(AC 1번). VOC 선례 예외 + 공유 core 카운터 결정 명기.

## 미해결

없음 (codex 7 findings 전부 반영).
