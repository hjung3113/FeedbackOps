// vitest globalSetup — runs once per `vitest run`, before any test file.
//
// Restores the database to its post-seed state so every run is a first run.
// See `reset-database.ts` for why (#205).
//
// No-op unless the full integration env is present. The default gate
// (`pnpm --filter backend test` with no env exported) skips all 90 integration
// suites anyway, so there is nothing to reset and nothing to seed — this must
// stay silent and touch no database in that mode.

import { createDb } from '../db/client.js';
import { runSeed } from '../seed/index.js';
import { resetDatabase } from './reset-database.js';

export default async function setup(): Promise<void> {
  const appUrl = process.env.DATABASE_URL ?? '';
  const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
  const workspaceId = process.env.WORKSPACE_ID ?? '';

  // Partial env cannot be reset safely: without WORKSPACE_ID the seed has no
  // workspace to bind to (ADR-0006), and truncating without re-seeding would
  // leave the suites that read seed fixtures worse off than not resetting.
  if (!appUrl || !migrateUrl || !workspaceId) return;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to reset the database with NODE_ENV=production. The test ' +
        'globalSetup truncates every product table.',
    );
  }

  if (process.env.TEST_DB_NO_RESET === '1') {
    console.warn(
      '[global-setup] TEST_DB_NO_RESET=1 — skipping reset. Failure counts will ' +
        'depend on how many times this suite has already run against this ' +
        'database (#205).',
    );
    return;
  }

  const { tablesTruncated } = await resetDatabase(migrateUrl);

  const handle = createDb(appUrl);
  try {
    await runSeed(handle);
  } finally {
    await handle.close();
  }

  console.warn(`[global-setup] reset ${tablesTruncated} tables and re-seeded before the run.`);
}
