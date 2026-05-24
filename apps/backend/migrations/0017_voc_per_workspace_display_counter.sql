-- Issue #34 (DB-C-4 / API-A-1): replace the global VOC display-id sequence
-- with a per-workspace counter. Existing numeric VOC-#### ids are backfilled
-- so the next generated id never re-issues an existing workspace-local slug;
-- deterministic non-numeric seed slugs such as VOC-SEED-* are ignored.

CREATE TABLE IF NOT EXISTS "voc"."workspace_display_counters" (
  "workspace_id" uuid PRIMARY KEY,
  "next_value" bigint NOT NULL DEFAULT 1000
);
--> statement-breakpoint

INSERT INTO voc.workspace_display_counters (workspace_id, next_value)
SELECT
  v.workspace_id,
  GREATEST(
    1000,
    COALESCE(
      max(regexp_replace(v.display_id, '^VOC-', '')::bigint)
        FILTER (WHERE v.display_id ~ '^VOC-[0-9]+$'),
      999
    ) + 1
  ) AS next_value
FROM voc.vocs v
GROUP BY v.workspace_id
ON CONFLICT (workspace_id) DO UPDATE
  SET next_value = GREATEST(
    voc.workspace_display_counters.next_value,
    excluded.next_value
  );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "voc"."next_voc_display_id"(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, voc
AS $$
DECLARE
  v_seq bigint;
BEGIN
  INSERT INTO voc.workspace_display_counters (workspace_id, next_value)
  VALUES (p_workspace_id, 1000)
  ON CONFLICT (workspace_id) DO NOTHING;

  UPDATE voc.workspace_display_counters
     SET next_value = next_value + 1
   WHERE workspace_id = p_workspace_id
   RETURNING next_value - 1 INTO v_seq;

  RETURN 'VOC-' || v_seq::text;
END;
$$;
--> statement-breakpoint

DROP SEQUENCE IF EXISTS "voc"."voc_display_seq";
--> statement-breakpoint

GRANT SELECT ON "voc"."workspace_display_counters" TO fops_app;
GRANT EXECUTE ON FUNCTION "voc"."next_voc_display_id"(uuid) TO fops_app;
