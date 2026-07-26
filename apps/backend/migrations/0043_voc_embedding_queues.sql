-- #168 step 3 (ADR-0034 D6): pre-create the two VOC embedding ingestion queues.
-- fops_app holds no DDL on pgboss.*, so queues are created here as fops_migrate
-- and the boot path only verifies existence (same contract as migration 0032).
--
-- `voc.embed_voc`         — one job per VOC needing an embedding at the active version.
-- `voc.embedding_backfill` — cron fan-out that enqueues the above in bounded batches.
--
-- Retry config mirrors ADR-0009 (5 attempts, 30s base delay, exponential backoff).
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'voc.embed_voc',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO pgboss.queue (
  name, policy, retry_limit, retry_delay, retry_backoff, retry_delay_max,
  expire_seconds, retention_seconds, deletion_seconds, warning_queued,
  dead_letter, partition, table_name, heartbeat_seconds
) VALUES (
  'voc.embedding_backfill',
  'standard', 5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
) ON CONFLICT DO NOTHING;
