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
