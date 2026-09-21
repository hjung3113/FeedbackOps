// Core module job registrations. Mirrors the pattern other modules
// (VOC, Survey, Task, Finding) will follow as their slices land: each
// module exports `register<Module>Jobs(boss, deps)` and the backend
// entrypoint calls them in sequence between pg-boss start and Fastify
// listen (ADR-0009:22-27).

import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import type { JobLog } from '../../../lib/job-log.js';
import type { StorageBackend } from '../../../lib/storage/index.js';
import { registerIdempotencyPurge } from './idempotency-purge.js';
import { registerAttachmentsPurge } from './purge-unlinked-attachments.js';
import { registerRateLimitsPurge } from './rate-limits-purge.js';

export interface CoreJobDeps {
  db: Db;
  /** Optional — only required to enable the attachments_purge job (PLAN-22 C4b). */
  pool?: pg.Pool;
  /** Optional — only required to enable the attachments_purge job (PLAN-22 C4b). */
  storage?: StorageBackend;
  /** Structured job logger (ADR-0013, amended 2026-09-22). Required in prod wiring. */
  log: JobLog;
}

export async function registerCoreJobs(boss: PgBoss, deps: CoreJobDeps): Promise<void> {
  await registerIdempotencyPurge(boss, { db: deps.db, log: deps.log });
  await registerRateLimitsPurge(boss, { db: deps.db, log: deps.log });
  // Attachments-purge needs raw pool (size_bytes is bigint → easier as text via pg)
  // plus the storage backend. Skip cleanly if either is absent so callers that
  // only need idempotency/rate-limits don't have to wire stub storage.
  if (deps.pool && deps.storage) {
    await registerAttachmentsPurge(boss, {
      pool: deps.pool,
      storage: deps.storage,
      log: deps.log,
    });
  }
}

export { IDEMPOTENCY_PURGE_QUEUE, IDEMPOTENCY_PURGE_CRON } from './idempotency-purge.js';
export { purgeExpiredIdempotencyKeys } from './idempotency-purge.js';
export { RATE_LIMITS_PURGE_QUEUE, RATE_LIMITS_PURGE_CRON } from './rate-limits-purge.js';
export { purgeExpiredRateLimits } from './rate-limits-purge.js';
export {
  ATTACHMENTS_PURGE_QUEUE,
  ATTACHMENTS_PURGE_CRON,
  purgeUnlinkedAttachments,
  registerAttachmentsPurge,
} from './purge-unlinked-attachments.js';
