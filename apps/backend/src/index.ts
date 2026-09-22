// Backend runtime entry. Boot order is fixed by ADR-0009:22-27:
//   1. Connect Drizzle pool (fops_app) and assert the runtime DB role (#402).
//   2. Start pg-boss against the same Postgres.
//   3. Register module jobs (registerCoreJobs, …).
//   4. Build and listen Fastify HTTP.
//
// Graceful shutdown reverses the order: stop pg-boss (let in-flight jobs
// drain) → close Fastify (stop accepting new HTTP) → close the Drizzle pool.
// SIGTERM is the production signal; SIGINT exists for local dev (Ctrl-C).
//
// The migrate-role connection (DATABASE_URL_MIGRATE) is never imported here —
// only drizzle-kit and the seed script touch it (ADR-0008).

import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { RuntimeRoleError, assertRuntimeDbRole } from './db/runtime-role.js';
import { toJobLog } from './lib/job-log.js';
import { initBoss, shutdownBoss } from './lib/jobs.js';
import { createRootLogger } from './lib/logger.js';
import { getStorage } from './lib/storage/factory.js';
import { createAuditService } from './modules/core/audit/index.js';
import { registerCoreJobs } from './modules/core/jobs/index.js';
import { createPublicUpdateReviewCandidatesService } from './modules/voc/public-update-review-candidates/service.js';
import { createEmbeddingProvider, isEmbeddingEnabled } from './modules/voc/embedding/factory.js';
import { registerVocJobs } from './modules/voc/jobs/index.js';
import { buildServer } from './server.js';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL is required to start the backend (fops_app role).');
  process.exit(1);
}

const dbHandle = createDb(config.DATABASE_URL);

// #402 (ADR-0008): fail fast unless the runtime connection is actually
// authenticated as the plain fops_app role. The guard queries the connected
// role (current_user), not the URL text, so a URL pointed at fops_migrate or
// any privileged role is rejected before pg-boss or HTTP start. Migration and
// seed CLIs use DATABASE_URL_MIGRATE and never enter this guard.
try {
  await assertRuntimeDbRole(dbHandle.pool);
} catch (err) {
  // Only guard rejections carry safe, curated messages; a driver error (e.g.
  // connection refused) is reported by name so it can never echo a DSN.
  console.error(
    err instanceof RuntimeRoleError
      ? err.message
      : `runtime DB role check failed (${err instanceof Error ? err.name : 'unknown error'}); verify DATABASE_URL is reachable`,
  );
  process.exit(1);
}

// ADR-0013 (amended 2026-09-22): ONE pino root logger per process — job logs
// and request logs share its level + redaction. Created after the
// console.error guards above, which run before a logger can be trusted.
const logger = createRootLogger(config);
const jobLog = toJobLog(logger);

const boss = await initBoss({ connectionString: config.DATABASE_URL, log: jobLog });
await registerCoreJobs(boss, {
  db: dbHandle.db,
  pool: dbHandle.pool,
  // First getStorage() call wins the cached singleton: passing the job log
  // HERE (before buildServer's bare `getStorage()`) is what puts the
  // `storage: materialized` line on the structured root logger.
  storage: getStorage(undefined, { log: jobLog }),
  log: jobLog,
});
// #168 (ADR-0034 D6). Registered even when the provider is disabled: the
// backfill cron row must exist so enabling a provider is a config change, not
// a queue-registration change. Both handlers no-op while disabled.
await registerVocJobs(boss, {
  db: dbHandle.db,
  provider: createEmbeddingProvider(config),
  embeddingVersion: config.EMBEDDING_VERSION,
  embeddingEnabled: isEmbeddingEnabled(config),
  publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
    db: dbHandle.db,
    auditService: createAuditService(),
  }),
  log: jobLog,
});

const app = await buildServer({ config, dbHandle, boss, logger });

// Single-shot shutdown handler. Multiple signals (e.g. SIGTERM then SIGINT)
// short-circuit through the `shuttingDown` flag so we don't try to close pools
// twice.
let shuttingDown = false;
async function shutdown(signal: string, code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  try {
    // ADR-0009: pg-boss drains BEFORE Fastify so in-flight jobs that need a
    // live HTTP path (e.g. webhook callouts) still have one.
    await shutdownBoss(boss);
    await app.close();
    await dbHandle.close();
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
  process.exit(code);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  await shutdownBoss(boss).catch(() => {});
  await dbHandle.close();
  process.exit(1);
}
