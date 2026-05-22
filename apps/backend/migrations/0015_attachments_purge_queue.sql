-- PLAN-22 C4b: pre-create the `core.attachments_purge` pg-boss queue.
--
-- Sibling of `core.idempotency_purge` (migration 0003) and
-- `core.rate_limits_purge` (migration 0004). fops_app does not hold the
-- DDL branch of `pgboss.create_queue` (F-010 / ADR-0008), so every queue
-- consumed by `registerCoreJobs` is pre-created in a migration. Column
-- list and retry config mirror the existing two rows verbatim
-- (retry_limit=5, retry_delay=30, retry_backoff=true; ADR-0009).
--
-- The handler (purge-unlinked-attachments.ts) reclaims rows in
-- `voc.voc_attachments` where voc_id IS NULL AND comment_id IS NULL AND
-- created_at < now() - 24h, plus their backing S3 objects.

INSERT INTO pgboss.queue (
  name,
  policy,
  retry_limit,
  retry_delay,
  retry_backoff,
  retry_delay_max,
  expire_seconds,
  retention_seconds,
  deletion_seconds,
  warning_queued,
  dead_letter,
  partition,
  table_name,
  heartbeat_seconds
) VALUES
  (
    'core.attachments_purge',
    'standard',
    5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
  )
ON CONFLICT DO NOTHING;
