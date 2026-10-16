CREATE TABLE "voc"."no_follow_up_decisions" (
	"workspace_id" uuid NOT NULL,
	"voc_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by_actor_id" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "no_follow_up_decisions_workspace_id_voc_id_pk" PRIMARY KEY("workspace_id","voc_id"),
	CONSTRAINT "voc_no_follow_up_decision_check" CHECK ("voc"."no_follow_up_decisions"."decision" = 'no_follow_up'),
	CONSTRAINT "voc_no_follow_up_reason_check" CHECK (length(btrim("voc"."no_follow_up_decisions"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "voc"."no_follow_up_decisions" ADD CONSTRAINT "no_follow_up_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."no_follow_up_decisions" ADD CONSTRAINT "no_follow_up_decisions_voc_id_vocs_id_fk" FOREIGN KEY ("voc_id") REFERENCES "voc"."vocs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voc"."no_follow_up_decisions" ADD CONSTRAINT "no_follow_up_decisions_decided_by_actor_id_actors_id_fk" FOREIGN KEY ("decided_by_actor_id") REFERENCES "core"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- #1226: VOC-owned current decision only; no DELETE grant or broader role changes.
GRANT ALL ON voc.no_follow_up_decisions TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON voc.no_follow_up_decisions TO fops_app;
--> statement-breakpoint
GRANT UPDATE (decision, reason, decided_by_actor_id, decided_at, updated_at, withdrawn_at)
  ON voc.no_follow_up_decisions TO fops_app;
