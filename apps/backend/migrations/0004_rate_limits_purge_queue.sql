-- F-018: pre-create the `core.rate_limits_purge` pg-boss queue.
--
-- Sibling of `core.idempotency_purge` (migration 0003 Section C). The
-- running app holds EXECUTE on `pgboss.create_queue` only for the
-- "no-DDL" branch — every queue used by Core jobs is pre-created here so
-- the boot path never triggers CREATE TABLE / ATTACH PARTITION
-- (F-010 / ADR-0008 role separation, see migration 0003 lines 91-104).
--
-- Column list mirrors `pgboss.create_queue` defaults verbatim, identical
-- to the idempotency-purge row in 0003 except for `name`. Retry config
-- comes straight from ADR-0009: retry_limit=5, retry_delay=30,
-- retry_backoff=true.

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
    'core.rate_limits_purge',
    'standard',
    5, 30, true, NULL, 900, 1209600, 604800, 0, NULL, false, 'job_common', NULL
  )
ON CONFLICT DO NOTHING;
