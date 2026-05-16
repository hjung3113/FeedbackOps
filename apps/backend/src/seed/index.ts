// Slice 1 seed — invoked by `pnpm --filter @fops/backend db:seed`.
//
// Decisions locked by Slice 1 grilling session (Q2, Q4, Q11):
//   * Seed is a SEPARATE command, not embedded in a migration. Migrations are
//     for schema; seed is for canonical baseline data so the app boots on a
//     freshly migrated database.
//   * The seed runs as the fops_app role via DATABASE_URL — proving the app
//     role can write to non-audit tables. The seed never touches core.audit_log.
//   * Three baseline actors per CONTEXT.md vocabulary:
//       - mock-admin-1 / admin@feedbackops.local  / role_level=admin     / actor_type=internal_member
//       - mock-user-1  / user@feedbackops.local   / role_level=user      / actor_type=internal_member
//       - system       / system@feedbackops.local / role_level=admin     / actor_type=system
//     (system has admin role so it can perform workspace-wide writes when
//     used by background jobs; ADR-0006 is silent on this so the decision
//     lives in the grill transcript.)
//   * Idempotent. Re-running the seed inserts zero new rows.

import { loadConfig } from '../config.js';
import { type DbHandle, createDb } from '../db/client.js';
import { actors, workspaces } from '../db/schema/core.js';

const SEED_ACTORS = [
  {
    externalId: 'mock-admin-1',
    email: 'admin@feedbackops.local',
    displayName: 'Mock Admin',
    roleLevel: 'admin',
    actorType: 'internal_member',
  },
  {
    externalId: 'mock-user-1',
    email: 'user@feedbackops.local',
    displayName: 'Mock User',
    roleLevel: 'user',
    actorType: 'internal_member',
  },
  {
    externalId: 'system',
    email: 'system@feedbackops.local',
    displayName: 'System',
    roleLevel: 'admin',
    actorType: 'system',
  },
] as const;

export interface SeedResult {
  workspaceId: string;
  workspaceInserted: boolean;
  actorsInserted: number;
}

export async function runSeed(handle: DbHandle): Promise<SeedResult> {
  const config = loadConfig();
  if (config.SEED_MODE !== 'core') {
    throw new Error(`Unsupported SEED_MODE='${config.SEED_MODE}'. Slice 1 only ships 'core'.`);
  }
  if (!config.WORKSPACE_ID) {
    throw new Error(
      'WORKSPACE_ID env var is required. Generate a UUID and reuse it across migrate/seed/app boots so every record binds to the same Workspace per ADR-0006.',
    );
  }

  const { db } = handle;
  const workspaceId = config.WORKSPACE_ID;

  // ── Workspace upsert ────────────────────────────────────────────────
  const wsRows = await db
    .insert(workspaces)
    .values({ id: workspaceId, name: config.WORKSPACE_NAME })
    .onConflictDoNothing({ target: workspaces.id })
    .returning({ id: workspaces.id });
  const workspaceInserted = wsRows.length > 0;

  // ── Actor upsert ────────────────────────────────────────────────────
  // Per Q5 unique index on (workspace_id, external_id) we conflict on that
  // tuple; the unique-index ON CONFLICT path requires the actual index
  // expression in Drizzle 0.38. Using onConflictDoNothing with a SQL target.
  let actorsInserted = 0;
  for (const a of SEED_ACTORS) {
    const rows = await db
      .insert(actors)
      .values({
        workspaceId,
        externalId: a.externalId,
        email: a.email,
        displayName: a.displayName,
        roleLevel: a.roleLevel,
        actorType: a.actorType,
      })
      .onConflictDoNothing({
        target: [actors.workspaceId, actors.externalId],
      })
      .returning({ id: actors.id });
    if (rows.length > 0) actorsInserted += 1;
  }

  return { workspaceId, workspaceInserted, actorsInserted };
}

// ── CLI entry ─────────────────────────────────────────────────────────
// Skip the auto-run when this module is imported (e.g. by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is required to run the seed.');
    process.exit(1);
  }
  const handle = createDb(config.DATABASE_URL);
  try {
    const _result = await runSeed(handle);
  } finally {
    await handle.close();
  }
}
