// Backend runtime entry. Boot order is fixed by ADR-0009:22-27:
//   1. Connect Drizzle pool (fops_app).
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
import { initBoss, shutdownBoss } from './lib/jobs.js';
import { getStorage } from './lib/storage/factory.js';
import { createAuditService } from './modules/core/audit/index.js';
import { registerCoreJobs } from './modules/core/jobs/index.js';
import { registerTasksJobs } from './modules/tasks/index.js';
import { createPublicUpdateReviewCandidatesService } from './modules/voc/public-update-review-candidates/service.js';
import { buildServer } from './server.js';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL is required to start the backend (fops_app role).');
  process.exit(1);
}

const dbHandle = createDb(config.DATABASE_URL);

const boss = await initBoss({ connectionString: config.DATABASE_URL });
await registerCoreJobs(boss, {
  db: dbHandle.db,
  pool: dbHandle.pool,
  storage: getStorage(),
});
await registerTasksJobs(boss, {
  db: dbHandle.db,
  publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
    db: dbHandle.db,
    auditService: createAuditService(),
  }),
});

const app = await buildServer({ config, dbHandle, boss });

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
