-- Slice 3 #12: VOC foundation. This task (Task 3) lands the vocs core table,
-- next_voc_display_id() helper, and AA→primary_MS integrity trigger.
-- Later tasks (4–7) will append conversation tables, voc_attachments stub,
-- reporter_facing_status_transitions, and Slice 3 seed rows to this file.
--
-- ADR alignment:
--   ADR-0008 — least-privilege grants; fops_app DML on vocs, SELECT/INSERT-only
--              will apply to append-only conversation tables (Tasks 4+).
--   ADR-0011 — rich content stored as jsonb, server-sanitised at service layer.
--   ADR-0015 — uuid v4 PKs, timestamptz, idempotency conventions.
--   ADR-0017 — audit detail vocab; audit_log rows emitted by service layer.
--   ADR-0019 — role grants pattern continued from migration 0009.
--
-- Resolved spec questions:
--   Q-DISPLAYID → backend owns display_id via next_voc_display_id(workspace_id).
--   Q1          → voc_attachments stub ships in Task 5; storage endpoint deferred.
--   Q6          → seed extended in apps/backend/src/seed/voc-fixtures.ts (Task 7).

CREATE SCHEMA IF NOT EXISTS "voc";
--> statement-breakpoint

-- ─── voc.voc_display_seq ──────────────────────────────────────────────────
-- Global sequence for human-readable VOC IDs. Per-workspace uniqueness is
-- enforced by the UNIQUE index on vocs.(workspace_id, display_id).
-- The helper still accepts workspace_id so a future migration can swap to
-- per-workspace sequences without changing callers.
CREATE SEQUENCE "voc"."voc_display_seq" START 1000;
--> statement-breakpoint

-- ─── voc.next_voc_display_id(uuid) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION "voc"."next_voc_display_id"(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq bigint;
BEGIN
  -- workspace_id reserved for future per-workspace sequence variants.
  PERFORM p_workspace_id;
  v_seq := nextval('voc.voc_display_seq');
  RETURN 'VOC-' || v_seq::text;
END;
$$;
--> statement-breakpoint

-- ─── voc.vocs ─────────────────────────────────────────────────────────────
-- Canonical VOC record. display_id is assigned at INSERT via
-- next_voc_display_id(workspace_id). severity / analytics_area_id / owner
-- columns are nullable until triage. cluster_id column reserved for future
-- use (no FK per spec — cluster service is out of scope for Slice 3).
CREATE TABLE "voc"."vocs" (
  "id"                              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"                    uuid NOT NULL,
  "display_id"                      text NOT NULL,
  "primary_managed_system_id"       uuid NOT NULL,
  "analytics_area_id"               uuid,
  "reporter_id"                     uuid NOT NULL,
  "title"                           text NOT NULL,
  "description_rich_content"        jsonb NOT NULL,
  "severity"                        text,
  "reporter_facing_status"          text NOT NULL DEFAULT 'received',
  "triage_state"                    text NOT NULL DEFAULT 'untriaged',
  "triage_state_review_postponed_at" timestamp with time zone,
  "owner_user_id"                   uuid,
  "owner_team_id"                   uuid,
  "source_context"                  text NOT NULL,
  "cluster_id"                      uuid,
  "archived_at"                     timestamp with time zone,
  "archived_by_actor_id"            uuid,
  "created_at"                      timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"                      timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vocs_severity_enum"
    CHECK ("severity" IS NULL OR "severity" IN ('low','medium','high','critical')),
  CONSTRAINT "vocs_reporter_facing_status_enum"
    CHECK ("reporter_facing_status" IN
      ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "vocs_triage_state_enum"
    CHECK ("triage_state" IN
      ('untriaged','triaged','needs_more_information','dismissed_not_actionable')),
  CONSTRAINT "vocs_source_context_enum"
    CHECK ("source_context" IN
      ('direct_use','proxy_report','operational_discovery','stakeholder_request')),
  CONSTRAINT "vocs_owner_xor"
    CHECK ("owner_user_id" IS NULL OR "owner_team_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_primary_managed_system_id_fk"
  FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_analytics_area_id_fk"
  FOREIGN KEY ("analytics_area_id") REFERENCES "core"."analytics_areas"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_reporter_id_fk"
  FOREIGN KEY ("reporter_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_owner_user_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_owner_team_id_fk"
  FOREIGN KEY ("owner_team_id") REFERENCES "core"."teams"("id") ON DELETE no action;
--> statement-breakpoint
ALTER TABLE "voc"."vocs"
  ADD CONSTRAINT "vocs_archived_by_actor_id_fk"
  FOREIGN KEY ("archived_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "vocs_workspace_display_id_uq"
  ON "voc"."vocs" ("workspace_id", "display_id");
--> statement-breakpoint
CREATE INDEX "vocs_inbox_idx"
  ON "voc"."vocs" ("workspace_id", "primary_managed_system_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "vocs_my_vocs_idx"
  ON "voc"."vocs" ("workspace_id", "reporter_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "vocs_triage_queue_idx"
  ON "voc"."vocs" ("workspace_id", "triage_state")
  WHERE "triage_state" = 'untriaged';
--> statement-breakpoint
CREATE INDEX "vocs_active_idx"
  ON "voc"."vocs" ("workspace_id")
  WHERE "archived_at" IS NULL;
--> statement-breakpoint

-- ─── voc.vocs_analytics_area_integrity trigger ───────────────────────────
-- If analytics_area_id is set, its managed_system_id must equal
-- vocs.primary_managed_system_id (AA is flat under exactly one MS,
-- per Slice 2 exit criteria). Raises ERRCODE check_violation so the
-- application layer maps it to validation.failed.
CREATE OR REPLACE FUNCTION "voc"."vocs_analytics_area_integrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_aa_ms_id uuid;
BEGIN
  IF NEW.analytics_area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT managed_system_id INTO v_aa_ms_id
    FROM core.analytics_areas
   WHERE id = NEW.analytics_area_id;
  IF v_aa_ms_id IS NULL OR v_aa_ms_id <> NEW.primary_managed_system_id THEN
    RAISE EXCEPTION 'analytics_area_managed_system_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "vocs_analytics_area_integrity_trg"
  BEFORE INSERT OR UPDATE OF analytics_area_id, primary_managed_system_id
  ON "voc"."vocs"
  FOR EACH ROW EXECUTE FUNCTION "voc"."vocs_analytics_area_integrity"();
--> statement-breakpoint

-- ─── voc.touch_updated_at trigger (matches Slice 2 #9 pattern) ──────────
CREATE OR REPLACE FUNCTION "voc"."touch_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "vocs_touch_updated_at_trg"
  BEFORE UPDATE ON "voc"."vocs"
  FOR EACH ROW EXECUTE FUNCTION "voc"."touch_updated_at"();
--> statement-breakpoint

-- ─── Role grants per ADR-0008 + ADR-0019 ────────────────────────────────
-- fops_app needs USAGE on the voc schema before it can reach any table.
-- fops_app gets full DML on vocs (archive workflows are app-driven).
-- Conversation tables added in Tasks 4+ get tighter SELECT/INSERT-only grants.
GRANT USAGE ON SCHEMA "voc" TO fops_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."vocs" TO fops_app;
GRANT USAGE ON SEQUENCE "voc"."voc_display_seq" TO fops_app;
GRANT EXECUTE ON FUNCTION "voc"."next_voc_display_id"(uuid) TO fops_app;

-- ───── Conversation tables (append-only) ─────────────────────────────────────

--> statement-breakpoint
CREATE TABLE "voc"."voc_public_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "reporter_facing_status_before" text NOT NULL,
  "reporter_facing_status_after"  text NOT NULL,
  "skip_public_update" boolean NOT NULL DEFAULT false,
  "skip_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voc_public_updates_status_before_enum" CHECK ("reporter_facing_status_before" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "voc_public_updates_status_after_enum"  CHECK ("reporter_facing_status_after" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "voc_public_updates_skip_reason_min_length"
    CHECK ("skip_public_update" = false OR (length(coalesce("skip_reason", '')) >= 8))
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_public_updates" ADD CONSTRAINT "voc_public_updates_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_public_updates" ADD CONSTRAINT "voc_public_updates_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_public_updates_voc_created_idx" ON "voc"."voc_public_updates" ("voc_id", "created_at");

--> statement-breakpoint
CREATE TABLE "voc"."voc_reporter_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_reporter_replies" ADD CONSTRAINT "voc_reporter_replies_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_reporter_replies" ADD CONSTRAINT "voc_reporter_replies_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_reporter_replies_voc_created_idx" ON "voc"."voc_reporter_replies" ("voc_id", "created_at");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION "voc"."voc_reporter_reply_actor_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_reporter uuid;
BEGIN
  SELECT reporter_id INTO v_reporter FROM voc.vocs WHERE id = NEW.voc_id;
  IF v_reporter IS NULL OR v_reporter <> NEW.actor_id THEN
    RAISE EXCEPTION 'voc_reporter_reply_actor_must_be_reporter'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "voc_reporter_reply_actor_check_trg"
  BEFORE INSERT ON "voc"."voc_reporter_replies"
  FOR EACH ROW EXECUTE FUNCTION "voc"."voc_reporter_reply_actor_check"();

--> statement-breakpoint
CREATE TABLE "voc"."voc_internal_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_internal_comments" ADD CONSTRAINT "voc_internal_comments_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_internal_comments" ADD CONSTRAINT "voc_internal_comments_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_internal_comments_voc_created_idx" ON "voc"."voc_internal_comments" ("voc_id", "created_at");

--> statement-breakpoint
-- ───── Append-only grants (ADR-0019 pattern): fops_app SELECT + INSERT only.
GRANT SELECT, INSERT ON "voc"."voc_public_updates"    TO fops_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "voc"."voc_reporter_replies"  TO fops_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "voc"."voc_internal_comments" TO fops_app;

--> statement-breakpoint
-- ───── voc.voc_attachments (schema stub; storage endpoint deferred) ───
-- Polymorphic reference: either voc_id is set (attachment scoped to a VOC
-- directly) or comment_id is set (attachment scoped to a single
-- conversation entry) — never both. comment_kind discriminates which
-- conversation table the comment_id lives in. No SQL-level FK on
-- comment_id because it spans three tables; service code enforces
-- the target row exists. A future migration may add per-kind partial FKs.

CREATE TABLE "voc"."voc_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "voc_id" uuid,
  "comment_id" uuid,
  "comment_kind" text,
  "name" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "storage_uri" text NOT NULL,
  "uploaded_by_actor_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voc_attachments_subject_xor"
    CHECK (("voc_id" IS NOT NULL)::int + ("comment_id" IS NOT NULL)::int = 1),
  CONSTRAINT "voc_attachments_comment_kind_pair"
    CHECK (("comment_id" IS NULL AND "comment_kind" IS NULL)
        OR ("comment_id" IS NOT NULL AND "comment_kind" IN ('public_update','reporter_reply','internal_comment')))
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments" ADD CONSTRAINT "voc_attachments_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "voc"."voc_attachments" ADD CONSTRAINT "voc_attachments_uploaded_by_actor_id_fk"
  FOREIGN KEY ("uploaded_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action;
--> statement-breakpoint
CREATE INDEX "voc_attachments_voc_idx"
  ON "voc"."voc_attachments" ("voc_id") WHERE "voc_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "voc_attachments_comment_idx"
  ON "voc"."voc_attachments" ("comment_id", "comment_kind") WHERE "comment_id" IS NOT NULL;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."voc_attachments" TO fops_app;

--> statement-breakpoint
-- ───── voc.reporter_facing_status_transitions ─────────────────────────
-- Single source of truth for the reporter-facing status matrix per
-- docs/frontend/specs/voc.md §4.5. Backend nextReporterStates(current)
-- reads this table; service code MUST NOT hard-code transitions.
CREATE TABLE "voc"."reporter_facing_status_transitions" (
  "from_status" text NOT NULL,
  "to_status"   text NOT NULL,
  "allowed"     boolean NOT NULL,
  "forbidden_reason" text,
  PRIMARY KEY ("from_status", "to_status"),
  CONSTRAINT "rfst_from_enum" CHECK ("from_status" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "rfst_to_enum" CHECK ("to_status" IN
    ('received','reviewing','assigned','progress','prep','resolved','reopened','closed')),
  CONSTRAINT "rfst_allowed_no_reason" CHECK ("allowed" = false OR "forbidden_reason" IS NULL),
  CONSTRAINT "rfst_disallowed_has_reason" CHECK ("allowed" = true OR ("forbidden_reason" IS NOT NULL AND length("forbidden_reason") > 0))
);
--> statement-breakpoint
GRANT SELECT ON "voc"."reporter_facing_status_transitions" TO fops_app;
--> statement-breakpoint
INSERT INTO "voc"."reporter_facing_status_transitions" ("from_status","to_status","allowed","forbidden_reason") VALUES
  -- received
  ('received','reviewing',true, NULL),
  ('received','closed',   true, NULL),
  ('received','resolved', false,'결과 확인 전에 해결됨으로 바꿀 수 없습니다.'),
  ('received','prep',     false,'먼저 검토를 시작해야 합니다.'),
  -- reviewing
  ('reviewing','assigned',true, NULL),
  ('reviewing','progress',true, NULL),
  ('reviewing','closed',  true, NULL),
  ('reviewing','resolved',false,'담당자 배정 이후에 가능합니다.'),
  -- assigned
  ('assigned','progress', true, NULL),
  ('assigned','closed',   true, NULL),
  ('assigned','resolved', false,'처리가 완료되면 가능합니다.'),
  ('assigned','received', false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- progress
  ('progress','prep',     true, NULL),
  ('progress','resolved', true, NULL),
  ('progress','closed',   true, NULL),
  ('progress','received', false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- prep
  ('prep','resolved',     true, NULL),
  ('prep','progress',     true, NULL),
  ('prep','closed',       true, NULL),
  ('prep','received',     false,'다시 접수 상태로 돌릴 수 없습니다.'),
  -- resolved
  ('resolved','closed',   true, NULL),
  ('resolved','reopened', true, NULL),
  -- reopened
  ('reopened','progress', true, NULL),
  ('reopened','resolved', true, NULL),
  ('reopened','closed',   true, NULL),
  -- closed
  ('closed','reopened',   true, NULL),
  ('closed','resolved',   false,'이미 종료된 건입니다. 다시 해결됨으로 되돌리려면 먼저 다시 처리 중으로 전환하세요.');
--> statement-breakpoint

-- ───── voc.voc_permission_decisions_seed_fixture ──────────────────────
-- Seed-only fixture table. Holds the deterministic permission_decisions
-- envelopes the seed writes for two specific VOC fixtures (per #12
-- acceptance criterion). Production permission resolution does NOT use
-- this table — the real permission service computes envelopes per request
-- against permission_grants / permission_denies. This table exists so FE
-- snapshot tests can pin stable decision_ids and evaluated_at values
-- without re-running the live permission service.
CREATE TABLE "voc"."voc_permission_decisions_seed_fixture" (
  "voc_id" uuid PRIMARY KEY,
  "envelope" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voc"."voc_permission_decisions_seed_fixture"
  ADD CONSTRAINT "vpd_seed_voc_id_fk"
  FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."voc_permission_decisions_seed_fixture" TO fops_app;
