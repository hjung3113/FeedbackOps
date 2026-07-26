-- #168: pgvector-backed, versioned VOC embedding store (ADR-0034 D1/D2).
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "voc"."voc_embeddings" (
  "voc_id" uuid NOT NULL REFERENCES "voc"."vocs"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "core"."workspaces"("id"),
  "embedding_version" integer NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "dimensions" integer NOT NULL,
  "embedding" vector NOT NULL,
  "source_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "voc_embeddings_voc_version_pk" PRIMARY KEY ("voc_id", "embedding_version"),
  CONSTRAINT "voc_embeddings_dimensions_positive" CHECK ("dimensions" > 0),
  CONSTRAINT "voc_embeddings_version_positive" CHECK ("embedding_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "voc_embeddings_workspace_version_idx"
  ON "voc"."voc_embeddings" USING btree ("workspace_id", "embedding_version");
--> statement-breakpoint
GRANT ALL ON "voc"."voc_embeddings" TO fops_migrate;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "voc"."voc_embeddings" TO fops_app;
