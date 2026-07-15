ALTER TABLE "voc_cluster"."voc_clusters"
ADD COLUMN "severity" text,
ADD COLUMN "confidence" text,
ADD COLUMN "rationale" text,
ADD COLUMN "owner_user_id" uuid REFERENCES "core"."actors"("id"),
ADD COLUMN "confirmed_by" uuid REFERENCES "core"."actors"("id"),
ADD COLUMN "confirmed_at" timestamp with time zone,
ADD CONSTRAINT "voc_clusters_severity_check"
  CHECK ("severity" IS NULL OR "severity" IN ('low', 'medium', 'high', 'critical')),
ADD CONSTRAINT "voc_clusters_confidence_check"
  CHECK ("confidence" IS NULL OR "confidence" IN ('low', 'medium', 'high'));
