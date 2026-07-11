ALTER TABLE "task"."tasks"                 ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "finding"."findings"           ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "voc_cluster"."voc_clusters"   ALTER COLUMN "display_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_request"."task_requests" ALTER COLUMN "display_id" SET NOT NULL;
