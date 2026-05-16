// Core module job registrations. Mirrors the pattern other modules
// (VOC, Survey, Task, Finding) will follow as their slices land: each
// module exports `register<Module>Jobs(boss, deps)` and the backend
// entrypoint calls them in sequence between pg-boss start and Fastify
// listen (ADR-0009:22-27).

import type { PgBoss } from 'pg-boss';

import type { Db } from '../../../db/client.js';
import { registerIdempotencyPurge } from './idempotency-purge.js';
import { registerRateLimitsPurge } from './rate-limits-purge.js';

export interface CoreJobDeps {
  db: Db;
  log?: { info: (msg: string, meta?: unknown) => void };
}

export async function registerCoreJobs(boss: PgBoss, deps: CoreJobDeps): Promise<void> {
  await registerIdempotencyPurge(boss, deps);
  await registerRateLimitsPurge(boss, deps);
}

export { IDEMPOTENCY_PURGE_QUEUE, IDEMPOTENCY_PURGE_CRON } from './idempotency-purge.js';
export { purgeExpiredIdempotencyKeys } from './idempotency-purge.js';
export { RATE_LIMITS_PURGE_QUEUE, RATE_LIMITS_PURGE_CRON } from './rate-limits-purge.js';
export { purgeExpiredRateLimits } from './rate-limits-purge.js';
