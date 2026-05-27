// Core module job registrations. Mirrors the pattern other modules
// (VOC, Survey, Task, Finding) will follow as their slices land: each
// module exports `register<Module>Jobs(boss, deps)` and the backend
// entrypoint calls them in sequence between pg-boss start and Fastify
// listen (ADR-0009:22-27).

import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
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
  log?: {
    info: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export async function registerCoreJobs(boss: PgBoss, deps: CoreJobDeps): Promise<void> {
  // Idempotency + rate-limits siblings only need a single `info`-shaped logger;
  // narrow the type here so existing callers without `error` keep typechecking.
  const baseDeps: { db: Db; log?: { info: (msg: string, meta?: unknown) => void } } = deps.log
    ? { db: deps.db, log: { info: deps.log.info } }
    : { db: deps.db };
  await registerIdempotencyPurge(boss, baseDeps);
  await registerRateLimitsPurge(boss, baseDeps);
  // Attachments-purge needs raw pool (size_bytes is bigint → easier as text via pg)
  // plus the storage backend. Skip cleanly if either is absent so callers that
  // only need idempotency/rate-limits don't have to wire stub storage.
  if (deps.pool && deps.storage) {
    await registerAttachmentsPurge(
      boss,
      deps.log
        ? { pool: deps.pool, storage: deps.storage, log: deps.log }
        : { pool: deps.pool, storage: deps.storage },
    );
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
