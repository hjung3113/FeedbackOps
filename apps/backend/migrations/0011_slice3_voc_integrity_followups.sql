-- Slice 3 #12 Batch B: adversarial review integrity followups.
-- Addresses five findings from the post-0010 review pass:
--
--   CR-02 — AA integrity trigger lacked workspace tenancy guard; now also
--            asserts aa.workspace_id = NEW.workspace_id.
--   IM-05 — voc_public_updates_skip_reason_min_length used length() on raw
--            string; whitespace-only skip_reason would pass. Fixed with trim().
--   IM-06 — rfst_disallowed_has_reason used length() without trim(); same
--            whitespace-only bypass. Fixed with trim().
--   IM-04 — voc_attachments had no server-side check that comment_id actually
--            resolves to a row; adds BEFORE INSERT trigger.
--   IM-03 — voc_attachments lacked archive-over-delete columns; adds
--            archived_at / archived_by_actor_id + active partial index.
--            fops_app DELETE revoked (archive-over-delete invariant per AGENTS.md).
--
-- All statements are additive or idempotent (CREATE OR REPLACE). Migration 0010
-- is NOT modified.

-- ─── CR-02: AA integrity trigger — add workspace tenancy guard ──────────────
-- The original function in 0010 only checked managed_system_id equivalence.
-- This replacement also asserts workspace_id equivalence so an AA from a
-- different workspace cannot be attached even if the managed_system_id happens
-- to collide.
CREATE OR REPLACE FUNCTION "voc"."vocs_analytics_area_integrity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_aa_ms_id uuid;
  v_aa_workspace_id uuid;
BEGIN
  IF NEW.analytics_area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT managed_system_id, workspace_id
    INTO v_aa_ms_id, v_aa_workspace_id
    FROM core.analytics_areas
    WHERE id = NEW.analytics_area_id;
  IF v_aa_ms_id IS NULL THEN
    RAISE EXCEPTION 'analytics_area_not_found' USING ERRCODE = 'check_violation';
  END IF;
  IF v_aa_workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'analytics_area_workspace_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  IF v_aa_ms_id <> NEW.primary_managed_system_id THEN
    RAISE EXCEPTION 'analytics_area_managed_system_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- ─── IM-05: trim-aware skip_reason min-length CHECK ──────────────────────────
ALTER TABLE "voc"."voc_public_updates"
  DROP CONSTRAINT "voc_public_updates_skip_reason_min_length";
--> statement-breakpoint
ALTER TABLE "voc"."voc_public_updates"
  ADD CONSTRAINT "voc_public_updates_skip_reason_min_length"
  CHECK ("skip_public_update" = false OR (length(trim(coalesce("skip_reason", ''))) >= 8));
--> statement-breakpoint

-- ─── IM-06: trim-aware forbidden_reason presence CHECK ───────────────────────
ALTER TABLE "voc"."reporter_facing_status_transitions"
  DROP CONSTRAINT "rfst_disallowed_has_reason";
--> statement-breakpoint
ALTER TABLE "voc"."reporter_facing_status_transitions"
  ADD CONSTRAINT "rfst_disallowed_has_reason"
  CHECK ("allowed" = true OR ("forbidden_reason" IS NOT NULL AND length(trim("forbidden_reason")) > 0));
--> statement-breakpoint

-- ─── IM-04: voc_attachments polymorphic FK trigger ───────────────────────────
-- Asserts the comment_id row actually exists in the table named by comment_kind.
-- No SQL-level FK can span three tables; this trigger fills that gap.
CREATE OR REPLACE FUNCTION "voc"."voc_attachments_comment_target_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_exists boolean;
BEGIN
  IF NEW.comment_id IS NULL THEN
    RETURN NEW;
  END IF;
  CASE NEW.comment_kind
    WHEN 'public_update' THEN
      SELECT EXISTS(SELECT 1 FROM voc.voc_public_updates WHERE id = NEW.comment_id) INTO v_exists;
    WHEN 'reporter_reply' THEN
      SELECT EXISTS(SELECT 1 FROM voc.voc_reporter_replies WHERE id = NEW.comment_id) INTO v_exists;
    WHEN 'internal_comment' THEN
      SELECT EXISTS(SELECT 1 FROM voc.voc_internal_comments WHERE id = NEW.comment_id) INTO v_exists;
    ELSE
      RAISE EXCEPTION 'voc_attachments_invalid_comment_kind' USING ERRCODE = 'check_violation';
  END CASE;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'voc_attachments_comment_not_found' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "voc_attachments_comment_target_check_trg"
  BEFORE INSERT ON "voc"."voc_attachments"
  FOR EACH ROW EXECUTE FUNCTION "voc"."voc_attachments_comment_target_check"();
--> statement-breakpoint

-- ─── IM-03: voc_attachments archive-over-delete columns ─────────────────────
-- Adds archived_at + archived_by_actor_id per archive-over-delete invariant
-- (AGENTS.md). Service code archives via UPDATE archived_at = now() instead of
-- DELETE. The active partial index accelerates active-attachment queries.
-- fops_app DELETE revoked so hard-deletes are impossible from the app layer.
ALTER TABLE "voc"."voc_attachments"
  ADD COLUMN "archived_at" timestamp with time zone,
  ADD COLUMN "archived_by_actor_id" uuid;
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments"
  ADD CONSTRAINT "voc_attachments_archived_by_actor_id_fk"
  FOREIGN KEY ("archived_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
-- Index for active-only queries (archive-over-delete pattern).
CREATE INDEX "voc_attachments_active_idx"
  ON "voc"."voc_attachments" ("voc_id")
  WHERE "archived_at" IS NULL AND "voc_id" IS NOT NULL;
--> statement-breakpoint
REVOKE DELETE ON "voc"."voc_attachments" FROM fops_app;
