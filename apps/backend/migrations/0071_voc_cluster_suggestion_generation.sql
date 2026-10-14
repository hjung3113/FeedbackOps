CREATE INDEX "voc_embeddings_workspace_watermark_idx" ON "voc"."voc_embeddings" USING btree ("workspace_id","embedding_version","updated_at","voc_id");
--> statement-breakpoint
-- Precreated queue; no app DDL/grant changes (ADR-0009).
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'voc.cluster_suggestions', 'standard', 5, 30, true, NULL,
  900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
