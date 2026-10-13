CREATE TABLE "voc"."voc_cluster_suggestion_admissions" (
	"workspace_id" uuid NOT NULL,
	"primary_managed_system_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"new_admissions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "voc_cluster_suggestion_admissions_workspace_id_primary_managed_system_id_window_start_pk" PRIMARY KEY("workspace_id","primary_managed_system_id","window_start"),
	CONSTRAINT "voc_cluster_suggestion_admissions_nonnegative" CHECK ("voc"."voc_cluster_suggestion_admissions"."new_admissions" >= 0),
	CONSTRAINT "voc_cluster_suggestion_admissions_utc_hour" CHECK ("voc"."voc_cluster_suggestion_admissions"."window_start" AT TIME ZONE 'UTC' = date_trunc('hour', "voc"."voc_cluster_suggestion_admissions"."window_start" AT TIME ZONE 'UTC'))
);
--> statement-breakpoint
CREATE TABLE "voc"."voc_cluster_suggestion_counters" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"eligible_pending_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voc_cluster_suggestion_counters_nonnegative" CHECK ("voc"."voc_cluster_suggestion_counters"."eligible_pending_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "voc"."voc_cluster_suggestion_cursors" (
	"workspace_id" uuid NOT NULL,
	"primary_managed_system_id" uuid NOT NULL,
	"embedding_version" integer NOT NULL,
	"embedding_watermark" timestamp with time zone NOT NULL,
	"last_voc_id" uuid NOT NULL,
	"reconciliation_after_voc_id" uuid,
	"reconciled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voc_cluster_suggestion_cursors_workspace_id_primary_managed_system_id_pk" PRIMARY KEY("workspace_id","primary_managed_system_id"),
	CONSTRAINT "voc_cluster_suggestion_cursors_version_positive" CHECK ("voc"."voc_cluster_suggestion_cursors"."embedding_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "voc"."voc_cluster_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"primary_managed_system_id" uuid NOT NULL,
	"voc_a_id" uuid NOT NULL,
	"voc_b_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding_version" integer NOT NULL,
	"source_hash_a" text NOT NULL,
	"source_hash_b" text NOT NULL,
	"embedding_watermark_a" timestamp with time zone NOT NULL,
	"embedding_watermark_b" timestamp with time zone NOT NULL,
	"score" double precision NOT NULL,
	"cut" double precision NOT NULL,
	"run_correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"discarded_by_actor_id" uuid,
	"discarded_at" timestamp with time zone,
	"confirmed_by_actor_id" uuid,
	"confirmed_at" timestamp with time zone,
	"voc_cluster_id" uuid,
	CONSTRAINT "voc_cluster_suggestions_sorted_pair" CHECK ("voc"."voc_cluster_suggestions"."voc_a_id" < "voc"."voc_cluster_suggestions"."voc_b_id"),
	CONSTRAINT "voc_cluster_suggestions_revision_positive" CHECK ("voc"."voc_cluster_suggestions"."revision" > 0),
	CONSTRAINT "voc_cluster_suggestions_metadata_check" CHECK (length(trim("voc"."voc_cluster_suggestions"."provider")) > 0 AND length(trim("voc"."voc_cluster_suggestions"."model")) > 0 AND "voc"."voc_cluster_suggestions"."dimensions" > 0 AND "voc"."voc_cluster_suggestions"."embedding_version" > 0 AND length(trim("voc"."voc_cluster_suggestions"."source_hash_a")) > 0 AND length(trim("voc"."voc_cluster_suggestions"."source_hash_b")) > 0 AND "voc"."voc_cluster_suggestions"."score" BETWEEN 0 AND 1 AND "voc"."voc_cluster_suggestions"."cut" BETWEEN 0 AND 1),
	CONSTRAINT "voc_cluster_suggestions_lifecycle_check" CHECK (
      ("voc"."voc_cluster_suggestions"."state" = 'pending' AND "voc"."voc_cluster_suggestions"."discarded_by_actor_id" IS NULL AND "voc"."voc_cluster_suggestions"."discarded_at" IS NULL AND "voc"."voc_cluster_suggestions"."confirmed_by_actor_id" IS NULL AND "voc"."voc_cluster_suggestions"."confirmed_at" IS NULL AND "voc"."voc_cluster_suggestions"."voc_cluster_id" IS NULL)
      OR ("voc"."voc_cluster_suggestions"."state" = 'discarded' AND "voc"."voc_cluster_suggestions"."discarded_by_actor_id" IS NOT NULL AND "voc"."voc_cluster_suggestions"."discarded_at" IS NOT NULL AND "voc"."voc_cluster_suggestions"."confirmed_by_actor_id" IS NULL AND "voc"."voc_cluster_suggestions"."confirmed_at" IS NULL AND "voc"."voc_cluster_suggestions"."voc_cluster_id" IS NULL)
      OR ("voc"."voc_cluster_suggestions"."state" = 'confirmed' AND "voc"."voc_cluster_suggestions"."discarded_by_actor_id" IS NULL AND "voc"."voc_cluster_suggestions"."discarded_at" IS NULL AND "voc"."voc_cluster_suggestions"."confirmed_by_actor_id" IS NOT NULL AND "voc"."voc_cluster_suggestions"."confirmed_at" IS NOT NULL AND "voc"."voc_cluster_suggestions"."voc_cluster_id" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "core"."workspace_settings" ADD COLUMN "voc_cluster_suggestions_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestion_admissions" ADD CONSTRAINT "voc_cluster_suggestion_admissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestion_admissions" ADD CONSTRAINT "voc_cluster_suggestion_admissions_primary_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestion_counters" ADD CONSTRAINT "voc_cluster_suggestion_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestion_cursors" ADD CONSTRAINT "voc_cluster_suggestion_cursors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestion_cursors" ADD CONSTRAINT "voc_cluster_suggestion_cursors_primary_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_primary_managed_system_id_managed_systems_id_fk" FOREIGN KEY ("primary_managed_system_id") REFERENCES "core"."managed_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_voc_a_id_vocs_id_fk" FOREIGN KEY ("voc_a_id") REFERENCES "voc"."vocs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_voc_b_id_vocs_id_fk" FOREIGN KEY ("voc_b_id") REFERENCES "voc"."vocs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_discarded_by_actor_id_actors_id_fk" FOREIGN KEY ("discarded_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_confirmed_by_actor_id_actors_id_fk" FOREIGN KEY ("confirmed_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."voc_cluster_suggestions" ADD CONSTRAINT "voc_cluster_suggestions_voc_cluster_id_voc_clusters_id_fk" FOREIGN KEY ("voc_cluster_id") REFERENCES "voc_cluster"."voc_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voc_cluster_suggestions_pair_uq" ON "voc"."voc_cluster_suggestions" USING btree ("workspace_id","primary_managed_system_id","voc_a_id","voc_b_id");--> statement-breakpoint
CREATE INDEX "voc_cluster_suggestions_pending_idx" ON "voc"."voc_cluster_suggestions" USING btree ("workspace_id","primary_managed_system_id","created_at") WHERE "voc"."voc_cluster_suggestions"."state" = 'pending';
--> statement-breakpoint
-- ADR-0068: no application hard delete/TRUNCATE, including terminal pair history.
GRANT SELECT, INSERT, UPDATE ON voc.voc_cluster_suggestions,
  voc.voc_cluster_suggestion_counters, voc.voc_cluster_suggestion_cursors TO fops_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON voc.voc_cluster_suggestion_admissions TO fops_app;
--> statement-breakpoint
-- No composite keys/columns are added to the domain Cluster schema. Scope is
-- checked at writes; future commands still recheck current eligibility on reads.
CREATE FUNCTION voc.guard_cluster_suggestion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  ref_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.workspace_id, NEW.primary_managed_system_id, NEW.voc_a_id, NEW.voc_b_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.workspace_id, OLD.primary_managed_system_id, OLD.voc_a_id, OLD.voc_b_id, OLD.created_at) THEN
      RAISE EXCEPTION 'suggestion identity and initial timestamp are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.state = 'confirmed' THEN
      IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'confirmed suggestion history is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  PERFORM 1 FROM core.managed_systems
    WHERE id = NEW.primary_managed_system_id AND workspace_id = NEW.workspace_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion Managed System scope mismatch' USING ERRCODE = '23514';
  END IF;
  FOR ref_id IN SELECT id FROM voc.vocs
    WHERE id IN (NEW.voc_a_id, NEW.voc_b_id) ORDER BY id FOR SHARE
  LOOP
    PERFORM 1 FROM voc.vocs WHERE id = ref_id
      AND workspace_id = NEW.workspace_id AND primary_managed_system_id = NEW.primary_managed_system_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'suggestion VOC scope mismatch' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- The ordinary NO ACTION FKs reject nonexistent references and prevent deletion.
  IF NEW.discarded_by_actor_id IS NOT NULL THEN
    PERFORM 1 FROM core.actors WHERE id = NEW.discarded_by_actor_id AND workspace_id = NEW.workspace_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'suggestion discard Actor scope mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.confirmed_by_actor_id IS NOT NULL THEN
    PERFORM 1 FROM core.actors WHERE id = NEW.confirmed_by_actor_id AND workspace_id = NEW.workspace_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'suggestion confirmation Actor scope mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.voc_cluster_id IS NOT NULL THEN
    PERFORM 1 FROM voc_cluster.voc_clusters WHERE id = NEW.voc_cluster_id
      AND workspace_id = NEW.workspace_id AND primary_managed_system_id = NEW.primary_managed_system_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'suggestion Cluster scope mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION voc.guard_cluster_suggestion() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER cluster_suggestion_guard BEFORE INSERT OR UPDATE ON voc.voc_cluster_suggestions
FOR EACH ROW EXECUTE FUNCTION voc.guard_cluster_suggestion();
--> statement-breakpoint
CREATE FUNCTION voc.guard_cluster_suggestion_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- Progress rows are keyed by workspace/MS (and UTC hour for admissions); a key
  -- change would let a live admission bucket be moved into an ended hour and reclaimed.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.primary_managed_system_id IS DISTINCT FROM OLD.primary_managed_system_id THEN
      RAISE EXCEPTION 'suggestion progress identity is immutable' USING ERRCODE = '23514';
    END IF;
    -- Only admissions carry window_start; cursors must not reference it.
    IF TG_TABLE_NAME = 'voc_cluster_suggestion_admissions' THEN
      IF to_jsonb(NEW) -> 'window_start' IS DISTINCT FROM to_jsonb(OLD) -> 'window_start' THEN
        RAISE EXCEPTION 'suggestion progress identity is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  PERFORM 1 FROM core.managed_systems WHERE id = NEW.primary_managed_system_id
    AND workspace_id = NEW.workspace_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion progress Managed System scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION voc.guard_cluster_suggestion_progress() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER cluster_suggestion_admissions_scope BEFORE INSERT OR UPDATE ON voc.voc_cluster_suggestion_admissions
FOR EACH ROW EXECUTE FUNCTION voc.guard_cluster_suggestion_progress();
--> statement-breakpoint
CREATE TRIGGER cluster_suggestion_cursors_scope BEFORE INSERT OR UPDATE ON voc.voc_cluster_suggestion_cursors
FOR EACH ROW EXECUTE FUNCTION voc.guard_cluster_suggestion_progress();
--> statement-breakpoint
CREATE FUNCTION voc.guard_cluster_suggestion_bucket_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'fops_app' AND OLD.window_start + interval '1 hour' > statement_timestamp() THEN
    RAISE EXCEPTION 'only ended suggestion admission buckets may be reclaimed' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION voc.guard_cluster_suggestion_bucket_delete() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER cluster_suggestion_admissions_retention BEFORE DELETE ON voc.voc_cluster_suggestion_admissions
FOR EACH ROW EXECUTE FUNCTION voc.guard_cluster_suggestion_bucket_delete();
