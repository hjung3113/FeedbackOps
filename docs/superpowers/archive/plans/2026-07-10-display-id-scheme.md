# 휴먼 display-id 스킴 Implementation Plan (#142)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task/Finding/Cluster/TaskRequest 4개 엔터티에 per-workspace 순차 휴먼 식별자(`TASK-`/`FIN-`/`CLU-`/`REQ-`, 1000부터)를 부여하고 생성 시 자동 할당 + 기존 로우 백필 + FE 노출.

**Architecture:** 공유 `core.display_counters` 테이블 + `core.next_display_id(ws, entity_type)` SECDEF 함수(VOC `next_voc_display_id` 패턴 일반화). 각 repo INSERT 트랜잭션에서 함수 호출로 값 채움. 컬럼은 먼저 NULLABLE로 추가·백필 후, 코드가 전부 채우면 별도 마이그레이션에서 NOT NULL 승격(무중단·테스트 green 유지).

**Tech Stack:** PostgreSQL(plpgsql SECDEF), Drizzle ORM(raw 번호 .sql 마이그레이션 규약), zod strict DTO(`packages/shared`), Vitest 통합테스트, TanStack Router FE.

## Global Constraints

- 마이그레이션은 손으로 쓴 번호 .sql (`apps/backend/migrations/00NN_*.sql`) — drizzle-kit generate 아님. 다음 번호 = **0027**, 그다음 **0028**.
- DTO/API 필드명 = **snake_case `display_id`** (VOC `packages/shared/src/vocs/list-item.ts:40`과 통일). Drizzle/TS 내부 프로퍼티만 `displayId`.
- 시작값 1000. prefix: task→`TASK-`, finding→`FIN-`, cluster→`CLU-`, task_request→`REQ-`.
- SECDEF 함수 `OWNER TO fops_migrate`, `GRANT EXECUTE TO fops_app`. `search_path = pg_catalog, core`.
- entity_type 허용값: `task|finding|cluster|task_request` (CHECK + 함수 내부 CASE).
- 각 task 끝: `pnpm --filter backend exec vitest run <path>` green + `pnpm --filter backend typecheck` new-error 0.
- VOC(`voc.*`)는 손대지 않음.
- Spec: `docs/superpowers/specs/2026-07-10-display-id-scheme-design.md`. 리뷰: `.review/DISPLAY-ID-SPEC-REVIEW.json`.

## File Structure

- `apps/backend/migrations/0027_display_id_scheme.sql` (신규) — counter 테이블+CHECK, 함수+owner+grant, 4개 컬럼 NULLABLE, 백필, 유니크 인덱스
- `apps/backend/migrations/0028_display_id_not_null.sql` (신규) — 4개 컬럼 SET NOT NULL
- `apps/backend/src/db/schema/core.ts` — `displayCounters` 테이블
- `apps/backend/src/db/schema/{task,finding,voc-cluster,task-request}.ts` — `displayId` 컬럼 + 유니크 인덱스
- `apps/backend/drizzle.config.ts` — `schema`/`schemaFilter`에 `task`,`task_request` 추가 (F1)
- `apps/backend/src/modules/{tasks,findings,voc-clusters,task-requests}/repo.ts` — INSERT에 `next_display_id` 호출
- `packages/shared/src/{tasks,findings,...}/index.ts` — DTO에 `display_id`
- 각 모듈 read-service/mapper — `display_id` 매핑
- `apps/backend/src/modules/entity-links/service.ts` + `packages/shared/src/entity-links.ts` — summary/ref에 `display_id` (F5)
- 테스트 seed 사이트 5곳 (F4) — 공유 헬퍼 경유
- `docs/adr/0029-human-display-id-scheme.md` (신규)

---

### Task 1: 마이그레이션 0027 — 카운터 인프라 + 컬럼(NULLABLE) + 백필

**Files:**
- Create: `apps/backend/migrations/0027_display_id_scheme.sql`
- Create: `docs/adr/0029-human-display-id-scheme.md`
- Test: `apps/backend/src/db/__tests__/display-id-migration.integration.test.ts`

**Interfaces:**
- Produces: SQL 함수 `core.next_display_id(uuid, text) → text`; 컬럼 `{task.tasks,finding.findings,voc_cluster.voc_clusters,task_request.task_requests}.display_id text NULL`; 테이블 `core.display_counters(workspace_id, entity_type, next_value)`.

- [ ] **Step 1: 실패 테스트 작성** — 함수/백필 검증

```typescript
// display-id-migration.integration.test.ts
import { describe, it, expect } from 'vitest';
import { withTestDb } from '../../test-support/db.js'; // 기존 통합테스트 DB 헬퍼 규약 따를 것

describe('0027 display-id scheme', () => {
  it('next_display_id issues sequential per-workspace ids with correct prefix', async () => {
    await withTestDb(async (db, { workspaceId }) => {
      const a = await db.execute(sql`select core.next_display_id(${workspaceId}, 'task') as v`);
      const b = await db.execute(sql`select core.next_display_id(${workspaceId}, 'task') as v`);
      expect(a.rows[0].v).toBe('TASK-1000');
      expect(b.rows[0].v).toBe('TASK-1001');
    });
  });
  it('rejects unknown entity_type', async () => {
    await withTestDb(async (db, { workspaceId }) => {
      await expect(db.execute(sql`select core.next_display_id(${workspaceId}, 'bogus')`))
        .rejects.toThrow(/unknown entity_type/);
    });
  });
  it('different workspaces get independent sequences', async () => {
    await withTestDb(async (db, { workspaceId, otherWorkspaceId }) => {
      const a = await db.execute(sql`select core.next_display_id(${workspaceId}, 'finding') as v`);
      const b = await db.execute(sql`select core.next_display_id(${otherWorkspaceId}, 'finding') as v`);
      expect(a.rows[0].v).toBe('FIN-1000');
      expect(b.rows[0].v).toBe('FIN-1000');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — `pnpm --filter backend exec vitest run src/db/__tests__/display-id-migration.integration.test.ts` → 함수 없음으로 FAIL

- [ ] **Step 3: 마이그레이션 작성** `0027_display_id_scheme.sql`

```sql
-- Issue #142 / ADR-0029: 공유 per-workspace 휴먼 display-id 스킴.
-- VOC(voc.next_voc_display_id, 0017)의 일반화. VOC 자체는 미변경.

CREATE TABLE IF NOT EXISTS "core"."display_counters" (
  "workspace_id" uuid NOT NULL,
  "entity_type"  text NOT NULL,
  "next_value"   bigint NOT NULL DEFAULT 1000,
  PRIMARY KEY ("workspace_id", "entity_type"),
  CONSTRAINT "display_counters_entity_type_chk"
    CHECK ("entity_type" IN ('task','finding','cluster','task_request'))
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "core"."next_display_id"(p_workspace_id uuid, p_entity_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_seq bigint; v_prefix text;
BEGIN
  v_prefix := CASE p_entity_type
    WHEN 'task' THEN 'TASK-' WHEN 'finding' THEN 'FIN-'
    WHEN 'cluster' THEN 'CLU-' WHEN 'task_request' THEN 'REQ-' ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'unknown entity_type: %', p_entity_type; END IF;
  INSERT INTO core.display_counters (workspace_id, entity_type)
  VALUES (p_workspace_id, p_entity_type) ON CONFLICT (workspace_id, entity_type) DO NOTHING;
  UPDATE core.display_counters SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id AND entity_type = p_entity_type
   RETURNING next_value - 1 INTO v_seq;
  RETURN v_prefix || v_seq::text;
END; $$;
--> statement-breakpoint
ALTER FUNCTION "core"."next_display_id"(uuid, text) OWNER TO fops_migrate;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "core"."next_display_id"(uuid, text) TO fops_app;
GRANT SELECT ON "core"."display_counters" TO fops_app;
--> statement-breakpoint

-- 컬럼 NULLABLE 추가 (NOT NULL은 0028에서, 코드가 채운 뒤)
ALTER TABLE "task"."tasks"                 ADD COLUMN IF NOT EXISTS "display_id" text;
ALTER TABLE "finding"."findings"           ADD COLUMN IF NOT EXISTS "display_id" text;
ALTER TABLE "voc_cluster"."voc_clusters"   ADD COLUMN IF NOT EXISTS "display_id" text;
ALTER TABLE "task_request"."task_requests" ADD COLUMN IF NOT EXISTS "display_id" text;
--> statement-breakpoint

-- 기존 로우 백필: workspace별 created_at,id 순 1000부터. (F6: VOC와 다른 알고리즘)
-- task
WITH ranked AS (
  SELECT id, 'TASK-' || (999 + row_number() OVER (
    PARTITION BY workspace_id ORDER BY created_at ASC, id ASC))::text AS did
  FROM task.tasks)
UPDATE task.tasks t SET display_id = r.did FROM ranked r WHERE t.id = r.id;
--> statement-breakpoint
-- finding
WITH ranked AS (
  SELECT id, 'FIN-' || (999 + row_number() OVER (
    PARTITION BY workspace_id ORDER BY created_at ASC, id ASC))::text AS did
  FROM finding.findings)
UPDATE finding.findings f SET display_id = r.did FROM ranked r WHERE f.id = r.id;
--> statement-breakpoint
-- cluster
WITH ranked AS (
  SELECT id, 'CLU-' || (999 + row_number() OVER (
    PARTITION BY workspace_id ORDER BY created_at ASC, id ASC))::text AS did
  FROM voc_cluster.voc_clusters)
UPDATE voc_cluster.voc_clusters c SET display_id = r.did FROM ranked r WHERE c.id = r.id;
--> statement-breakpoint
-- task_request
WITH ranked AS (
  SELECT id, 'REQ-' || (999 + row_number() OVER (
    PARTITION BY workspace_id ORDER BY created_at ASC, id ASC))::text AS did
  FROM task_request.task_requests)
UPDATE task_request.task_requests tr SET display_id = r.did FROM ranked r WHERE tr.id = r.id;
--> statement-breakpoint

-- 카운터 seed = 1000 + workspace별 기존 로우 수
INSERT INTO core.display_counters (workspace_id, entity_type, next_value)
SELECT workspace_id, 'task', 1000 + count(*) FROM task.tasks GROUP BY workspace_id
ON CONFLICT (workspace_id, entity_type) DO UPDATE SET next_value = GREATEST(core.display_counters.next_value, excluded.next_value);
--> statement-breakpoint
INSERT INTO core.display_counters (workspace_id, entity_type, next_value)
SELECT workspace_id, 'finding', 1000 + count(*) FROM finding.findings GROUP BY workspace_id
ON CONFLICT (workspace_id, entity_type) DO UPDATE SET next_value = GREATEST(core.display_counters.next_value, excluded.next_value);
--> statement-breakpoint
INSERT INTO core.display_counters (workspace_id, entity_type, next_value)
SELECT workspace_id, 'cluster', 1000 + count(*) FROM voc_cluster.voc_clusters GROUP BY workspace_id
ON CONFLICT (workspace_id, entity_type) DO UPDATE SET next_value = GREATEST(core.display_counters.next_value, excluded.next_value);
--> statement-breakpoint
INSERT INTO core.display_counters (workspace_id, entity_type, next_value)
SELECT workspace_id, 'task_request', 1000 + count(*) FROM task_request.task_requests GROUP BY workspace_id
ON CONFLICT (workspace_id, entity_type) DO UPDATE SET next_value = GREATEST(core.display_counters.next_value, excluded.next_value);
--> statement-breakpoint

-- 유니크 인덱스 (NULL 허용, NULLS DISTINCT 기본)
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_workspace_display_id_uq"         ON "task"."tasks" ("workspace_id","display_id");
CREATE UNIQUE INDEX IF NOT EXISTS "findings_workspace_display_id_uq"      ON "finding"."findings" ("workspace_id","display_id");
CREATE UNIQUE INDEX IF NOT EXISTS "voc_clusters_workspace_display_id_uq"  ON "voc_cluster"."voc_clusters" ("workspace_id","display_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_requests_workspace_display_id_uq" ON "task_request"."task_requests" ("workspace_id","display_id");
```

- [ ] **Step 4: ADR 작성** `docs/adr/0029-human-display-id-scheme.md` — 결정(공유 core 카운터, per-workspace, prefix 매핑 함수내부, VOC 선례 예외 유지), 대안(per-schema 복제/전역 시퀀스/VOC 이관) 기각 이유, 결과. spec을 근거로 요약.

- [ ] **Step 5: 마이그레이션 적용 + 테스트 통과** — `pnpm --filter backend db:migrate` (기존 규약 확인) 후 `pnpm --filter backend exec vitest run src/db/__tests__/display-id-migration.integration.test.ts` → PASS. `pnpm --filter backend exec vitest run` 전체 여전히 green(컬럼 nullable이라 기존 raw-insert 안 깨짐).

- [ ] **Step 6: 커밋**

```bash
git add apps/backend/migrations/0027_display_id_scheme.sql docs/adr/0029-human-display-id-scheme.md apps/backend/src/db/__tests__/display-id-migration.integration.test.ts
git commit -m "feat(slice7): display-id 카운터+함수+백필 마이그레이션 0027 (#142)"
```

---

### Task 2: Drizzle 스키마 + config 동기화 (drift green)

**Files:**
- Modify: `apps/backend/src/db/schema/core.ts` (displayCounters 추가)
- Modify: `apps/backend/src/db/schema/task.ts`, `finding.ts`, `voc-cluster.ts`, `task-request.ts` (displayId 컬럼 + 유니크 인덱스)
- Modify: `apps/backend/drizzle.config.ts` (task, task_request 추가 — F1)

**Interfaces:**
- Consumes: Task 1의 DB 상태.
- Produces: Drizzle 프로퍼티 `displayId: text('display_id')` (nullable) on 4 tables; `displayCounters` table object.

- [ ] **Step 1: drizzle.config.ts 수정** — `schema` 배열에 `'./src/db/schema/task.ts'`, `'./src/db/schema/task-request.ts'` 추가; `schemaFilter`에 `'task'`, `'task_request'` 추가.

- [ ] **Step 2: core.ts에 displayCounters 추가**

```typescript
export const displayCounters = coreSchema.table('display_counters', {
  workspaceId: uuid('workspace_id').notNull(),
  entityType: text('entity_type').notNull(),
  nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1000),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspaceId, t.entityType] }),
}));
```

- [ ] **Step 3: 4개 테이블에 컬럼+인덱스 추가** (각 파일, 예: task.ts)

```typescript
// columns 블록에:
displayId: text('display_id'),           // nullable until 0028
// index 블록에:
workspaceDisplayUq: uniqueIndex('tasks_workspace_display_id_uq').on(t.workspaceId, t.displayId),
```
finding.ts → `findings_workspace_display_id_uq`, voc-cluster.ts → `voc_clusters_workspace_display_id_uq`, task-request.ts → `task_requests_workspace_display_id_uq`. (인덱스명은 Task 1 SQL과 정확히 일치해야 함.)

- [ ] **Step 4: drift 체크 green** — `pnpm --filter backend db:check` (또는 repo의 drift 검증 명령/테스트) → task/task_request 포함 diff 0. `pnpm --filter backend typecheck` new-error 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/backend/src/db/schema/ apps/backend/drizzle.config.ts
git commit -m "feat(slice7): drizzle schema+config에 display_id 반영, drift green (#142)"
```

---

### Task 3: Task 엔터티 end-to-end (repo 할당 + DTO + mapper + seed + 테스트) — 템플릿

**Files:**
- Modify: `apps/backend/src/modules/tasks/repo.ts:70` (INSERT)
- Modify: `packages/shared/src/tasks/index.ts` (taskDtoSchema)
- Modify: tasks read-service/mapper (display_id 매핑)
- Modify(seed, F4): `apps/backend/src/modules/tasks/__tests__/task-detail-and-finding-link.integration.test.ts`, `task-conversion.integration.test.ts`
- Test: `apps/backend/src/modules/tasks/__tests__/create-task-display-id.integration.test.ts` (신규)

**Interfaces:**
- Consumes: `core.next_display_id(workspaceId, 'task')`.
- Produces: TaskDto에 `display_id: string`; 공유 seed 헬퍼 `insertTaskRow(tx, {...})`가 display_id 자동 할당.

- [ ] **Step 1: 실패 테스트** — 생성 시 display_id = `TASK-1000...`

```typescript
it('assigns TASK- display_id on create', async () => {
  await withTestDb(async (_db, ctx) => {
    const t1 = await createTask(ctx, { title: 'a' });
    const t2 = await createTask(ctx, { title: 'b' });
    expect(t1.display_id).toBe('TASK-1000');
    expect(t2.display_id).toBe('TASK-1001');
  });
});
```

- [ ] **Step 2: 실패 확인** — vitest run 해당 파일 → FAIL (display_id undefined / DTO reject).

- [ ] **Step 3: repo INSERT 수정** — VOC 패턴(`voc/repo.ts:386`) 이식. INSERT 트랜잭션 안에서 먼저 함수 호출, `display_id` 컬럼에 삽입, RETURNING에 포함, 반환 매핑.

```typescript
const dr = await tx.execute<{ v: string }>(
  sql`select core.next_display_id(${input.workspaceId}, 'task') as v`);
const displayId = dr.rows[0]?.v;
if (!displayId) throw new Error('next_display_id returned empty');
// INSERT INTO task.tasks (..., display_id) VALUES (..., ${displayId}) RETURNING ..., display_id
```

- [ ] **Step 4: DTO + mapper** — `taskDtoSchema`에 `display_id: z.string(),` 추가(`.strict()` 유지). read-service/mapper가 row.display_id → dto.display_id.

- [ ] **Step 5: seed 헬퍼 (F4)** — tasks 테스트의 raw INSERT를 공유 헬퍼로 교체. 헬퍼는 `core.next_display_id` 호출해 display_id 채움(VOC `__tests__/_seed-helpers.ts` 스타일). `task-conversion`·`task-detail-and-finding-link` 테스트의 direct INSERT 사이트 전부 헬퍼 경유.

- [ ] **Step 6: 통과 + 회귀** — `pnpm --filter backend exec vitest run src/modules/tasks/` green, `pnpm --filter shared build && pnpm --filter backend typecheck` new-error 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/backend/src/modules/tasks/ packages/shared/src/tasks/
git commit -m "feat(slice7): task display_id 할당+DTO+seed (#142)"
```

---

### Task 4: Finding 엔터티 end-to-end

**Files:**
- Modify: `apps/backend/src/modules/findings/repo.ts` (INSERT), `packages/shared/src/findings/index.ts`, findings mapper
- Modify(seed, F4): `apps/backend/src/modules/findings/__tests__/evidence-highlights.integration.test.ts:150`, `apps/backend/src/modules/entity-links/__tests__/entity-links.integration.test.ts:183`
- Test: `apps/backend/src/modules/findings/__tests__/create-finding-display-id.integration.test.ts`

**Interfaces:** Consumes `core.next_display_id(ws,'finding')`. Produces FindingDto `display_id`.

- [ ] **Step 1: 실패 테스트**

```typescript
it('assigns FIN- display_id on create', async () => {
  await withTestDb(async (_db, ctx) => {
    const f = await createFinding(ctx, { title: 'x' });
    expect(f.display_id).toBe('FIN-1000');
  });
});
```

- [ ] **Step 2: 실패 확인** — vitest run → FAIL.
- [ ] **Step 3: repo INSERT** — `select core.next_display_id(${workspaceId}, 'finding')`, display_id 삽입+RETURNING+매핑 (Task 3 Step 3 형태, entity_type='finding', prefix 자동 FIN-).
- [ ] **Step 4: DTO+mapper** — findings DTO에 `display_id: z.string()` (strict 유지), mapper 매핑.
- [ ] **Step 5: seed (F4)** — evidence-highlights·entity-links 테스트의 finding raw INSERT를 헬퍼 경유로 교체.
- [ ] **Step 6: 통과+회귀** — `vitest run src/modules/findings/` green, typecheck new-error 0.
- [ ] **Step 7: 커밋** — `feat(slice7): finding display_id (#142)`

---

### Task 5: Cluster 엔터티 end-to-end

**Files:**
- Modify: `apps/backend/src/modules/voc-clusters/repo.ts`(INSERT), 해당 shared DTO(`packages/shared/src/.../clusters` — 실제 경로 확인), cluster mapper
- Modify(seed, F4): `apps/backend/src/modules/task-requests/__tests__/voc-request-task.integration.test.ts:156-162` 의 voc_cluster INSERT
- Test: `create-cluster-display-id.integration.test.ts`

**Interfaces:** Consumes `core.next_display_id(ws,'cluster')`. Produces ClusterDto `display_id`.

- [ ] **Step 1: 실패 테스트** — 생성 시 `display_id === 'CLU-1000'`.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: repo INSERT** — entity_type='cluster' (prefix 자동 CLU-). 클러스터 생성 경로가 여러 곳이면(자동 클러스터링 포함) 각 INSERT에 적용 — `rg "voc_clusters" apps/backend/src`로 생성 사이트 확인.
- [ ] **Step 4: DTO+mapper** — cluster DTO에 `display_id`.
- [ ] **Step 5: seed (F4)** — voc-request-task 테스트 cluster INSERT 헬퍼 경유.
- [ ] **Step 6: 통과+회귀** — `vitest run` 관련 파일 green, typecheck 0.
- [ ] **Step 7: 커밋** — `feat(slice7): cluster display_id (#142)`

---

### Task 6: TaskRequest 엔터티 end-to-end

**Files:**
- Modify: `apps/backend/src/modules/task-requests/repo.ts`(INSERT), `packages/shared/src/task-requests/*`(DTO), mapper
- Modify(seed, F4): `apps/backend/src/modules/task-requests/__tests__/voc-request-task.integration.test.ts`, `apps/backend/src/modules/tasks/__tests__/task-conversion.integration.test.ts:151,176,212` 의 task_request INSERT
- Test: `create-task-request-display-id.integration.test.ts`

**Interfaces:** Consumes `core.next_display_id(ws,'task_request')`. Produces TaskRequestDto `display_id`.

- [ ] **Step 1: 실패 테스트** — 생성 시 `display_id === 'REQ-1000'`.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: repo INSERT** — entity_type='task_request' (prefix 자동 REQ-).
- [ ] **Step 4: DTO+mapper** — task-request DTO에 `display_id`.
- [ ] **Step 5: seed (F4)** — 남은 task_request raw INSERT 사이트 헬퍼 경유. `rg`로 4개 테이블 direct INSERT 잔여 0 확인.
- [ ] **Step 6: 통과+회귀** — `vitest run` green, typecheck 0.
- [ ] **Step 7: 커밋** — `feat(slice7): task_request display_id (#142)`

---

### Task 7: Entity-link summary/ref에 display_id (F5)

**Files:**
- Modify: `apps/backend/src/modules/entity-links/service.ts:67-102` (summary provider)
- Modify: `packages/shared/src/entity-links.ts:42-45` (ref/summary DTO)
- Modify: entity-link 렌더 FE 컴포넌트
- Test: `apps/backend/src/modules/entity-links/__tests__/entity-links.integration.test.ts` (summary display_id 어서션 추가)

**Interfaces:**
- Consumes: 각 테이블의 display_id 컬럼(이제 채워짐).
- Produces: entity-link summary 응답 지원 타입(task/finding/task_request/cluster)에 `display_id: string`.

- [ ] **Step 1: 실패 테스트** — 링크된 finding→task summary에 `display_id` 포함, prefix 정확.
- [ ] **Step 2: 실패 확인** — FAIL(필드 없음).
- [ ] **Step 3: shared DTO** — entity-link summary/ref 스키마에 `display_id: z.string()` (지원 타입) 추가.
- [ ] **Step 4: service** — summary provider SELECT/매핑에 display_id 추가(finding/task/task_request/cluster 각 provider).
- [ ] **Step 5: FE** — 링크 렌더 컴포넌트가 uuid 대신 display_id 표기.
- [ ] **Step 6: 통과+회귀** — `vitest run src/modules/entity-links/` green, FE `pnpm --filter frontend exec vitest run` 관련 파일 green, typecheck 0.
- [ ] **Step 7: 커밋** — `feat(slice7): entity-link summary display_id (#142)`

---

### Task 8: 마이그레이션 0028 — SET NOT NULL

**Files:**
- Create: `apps/backend/migrations/0028_display_id_not_null.sql`
- Test: 기존 `display-id-migration.integration.test.ts`에 NOT NULL 어서션 추가

**Interfaces:** Consumes: 모든 INSERT 경로+seed가 display_id를 채우는 상태(Task 3-6 완료).

- [ ] **Step 1: 실패 테스트** — display_id 없이 raw INSERT 시도 → NOT NULL 위반 기대.

```typescript
it('rejects insert without display_id after 0028', async () => {
  await withTestDb(async (db, ctx) => {
    await expect(db.execute(sql`
      insert into task.tasks (id, workspace_id, primary_managed_system_id, title, status, priority, created_by, created_at, updated_at)
      values (gen_random_uuid(), ${ctx.workspaceId}, ${ctx.managedSystemId}, 't', 'backlog', 'low', ${ctx.actorId}, now(), now())
    `)).rejects.toThrow(/display_id/);
  });
});
```

- [ ] **Step 2: 실패 확인** — 0028 전이라 통과 안 됨(에러 안 남) → FAIL.

- [ ] **Step 3: 마이그레이션 작성**

```sql
-- Issue #142: display_id 전면 채워진 뒤 NOT NULL 승격.
ALTER TABLE "task"."tasks"                 ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "finding"."findings"           ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "voc_cluster"."voc_clusters"   ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ALTER COLUMN "display_id" SET NOT NULL;
```

- [ ] **Step 4: drizzle 스키마 NOT NULL 반영** — 4개 스키마 파일 `text('display_id').notNull()`로 변경, drift green.

- [ ] **Step 5: 적용+통과** — db:migrate 후 `pnpm --filter backend exec vitest run` 전체 green, `db:check` drift 0, typecheck 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/backend/migrations/0028_display_id_not_null.sql apps/backend/src/db/schema/
git commit -m "feat(slice7): display_id SET NOT NULL 마이그레이션 0028 (#142)"
```

---

### Task 9: FE display-id 노출 + 최종 검증

**Files:**
- Modify: task/finding/cluster/task-request 디테일·리스트 행 FE 컴포넌트 (raw uuid/shortId → display_id)
- Test: 관련 FE vitest

**Interfaces:** Consumes: 4개 DTO의 `display_id`.

- [ ] **Step 1: 실패 테스트** — 디테일/행 렌더가 `TASK-1000` 등 display_id 표기(uuid 아님).
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: FE 구현** — 각 화면에서 display_id 렌더. 프로토타입(`docs/design-prototype/screen-{tasks,findings,clusters}.jsx`)의 표기 위치·스타일 참고([[feedback-design-review-prototype]]).
- [ ] **Step 4: 통과** — `pnpm --filter frontend exec vitest run` 관련 파일 green.
- [ ] **Step 5: 전체 게이트** — 백엔드 전체 `vitest run` green, FE `vitest run` green, `typecheck` new-error 0, `db:check` drift 0.
- [ ] **Step 6: 커밋** — `feat(slice7): FE display_id 노출 (#142)`

---

## Self-Review

**Spec coverage:**
- 결정1 카운터/함수 → Task 1. CHECK+prefix내부(F3) → Task 1 SQL. OWNER(F7) → Task 1. ✅
- 결정2 per-workspace → Task 1 함수 키. ✅
- 결정3 컬럼/prefix/시작값/유니크 → Task 1(SQL)+Task 2(drizzle). ✅
- 결정4 백필 row_number(F6) → Task 1 Step 3. ✅
- 결정5 repo INSERT 할당 → Task 3-6 Step 3. ✅
- 결정6 DTO snake_case(F2)+entity-link(F5) → Task 3-6 Step4 + Task 7. ✅
- F1 drizzle.config → Task 2 Step 1. ✅
- F4 seed 사이트 5곳 → Task 3-6 Step 5. ✅
- 테스트 1-8 항목 → 각 Task 테스트 + Task 1(동시성/unknown), Task 8(NOT NULL), Task 2(drift). ✅
- ADR-0029 → Task 1 Step 4. ✅

**Placeholder scan:** SQL/DTO/테스트 코드 구체값 제공. "실제 경로 확인"은 cluster/task-request DTO 경로가 리포에서 확정 안 된 부분 — 구현자가 `rg`로 확정(명시적 지시). NOT 플레이스홀더.

**Type consistency:** 함수 시그니처 `core.next_display_id(uuid, text)` 전 Task 일치. 인덱스명 Task1 SQL ↔ Task2 drizzle 동일. DTO 필드 `display_id`(snake) 전 Task 일치.

## 미해결
없음.
