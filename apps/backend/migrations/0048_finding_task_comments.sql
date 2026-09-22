CREATE TABLE "finding"."finding_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "finding_id" uuid NOT NULL REFERENCES "finding"."findings"("id") ON DELETE cascade,
  "actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "kind" text NOT NULL DEFAULT 'note',
  "from_status" text,
  "to_status" text,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "finding_comments_kind_check"
    CHECK ("kind" IN ('note', 'status_change')),
  CONSTRAINT "finding_comments_status_pair_check"
    CHECK (
      ("kind" = 'note' AND "from_status" IS NULL AND "to_status" IS NULL)
      OR (
        "kind" = 'status_change'
        AND "from_status" IN ('draft','active','not_actionable','converted','archived')
        AND "to_status"   IN ('draft','active','not_actionable','converted','archived')
      )
    )
);
--> statement-breakpoint

CREATE INDEX "finding_comments_finding_created_idx"
  ON "finding"."finding_comments" ("finding_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint

GRANT ALL ON "finding"."finding_comments" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON "finding"."finding_comments" TO fops_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "finding"."finding_comments" FROM fops_app;
--> statement-breakpoint

CREATE TABLE "task"."task_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "task_id" uuid NOT NULL REFERENCES "task"."tasks"("id") ON DELETE cascade,
  "actor_id" uuid NOT NULL REFERENCES "core"."actors"("id"),
  "kind" text NOT NULL DEFAULT 'note',
  "from_status" text,
  "to_status" text,
  "body_rich_content" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "task_comments_kind_check"
    CHECK ("kind" IN ('note', 'status_change')),
  CONSTRAINT "task_comments_status_pair_check"
    CHECK (
      ("kind" = 'note' AND "from_status" IS NULL AND "to_status" IS NULL)
      OR (
        "kind" = 'status_change'
        AND "from_status" IN ('backlog','todo','doing','review','done','released','reopened')
        AND "to_status"   IN ('backlog','todo','doing','review','done','released','reopened')
      )
    )
);
--> statement-breakpoint

CREATE INDEX "task_comments_task_created_idx"
  ON "task"."task_comments" ("task_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint

GRANT ALL ON "task"."task_comments" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT ON "task"."task_comments" TO fops_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "task"."task_comments" FROM fops_app;
