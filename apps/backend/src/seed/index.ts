// Seed — invoked by `pnpm --filter @fops/backend db:seed`.
//
// Decisions locked by Slice 1 grilling session (Q2, Q4, Q11) and extended
// by Slice 2 grill Q9 (ADR-0017 / ADR-0018):
//   * Seed is a SEPARATE command, not embedded in a migration. Migrations
//     are for schema; seed is for canonical baseline data so the app boots
//     on a freshly migrated database.
//   * Runs as the fops_app role via DATABASE_URL — proves the app role can
//     write to non-audit tables. Never touches core.audit_log.
//   * Three baseline actors per CONTEXT.md vocabulary (Slice 1):
//       - mock-admin-1 / admin@feedbackops.local  / admin / internal_member
//       - mock-user-1  / user@feedbackops.local   / user  / internal_member
//       - system       / system@feedbackops.local / admin / system
//   * Slice 2 (#9) extends seed with the Managed System Registry baseline
//     per ADR-0017 / grill Q9:
//       - managed_systems: tableau, power-bi (default_owner = mock-admin-1).
//       - analytics_areas: 5 rows under those two MSs.
//       - teams: zero rows (ADR-0018 placeholder).
//   * Idempotent. Re-running the seed inserts zero new rows.

import { and, eq, isNull } from 'drizzle-orm';

import { loadConfig } from '../config.js';
import { type DbHandle, createDb } from '../db/client.js';
import { actors, analyticsAreas, managedSystems, workspaces } from '../db/schema/core.js';
import { ensureSeedTeam, seedSlice3Vocs } from './voc-fixtures.js';

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

// Slice 2 #9 baseline (ADR-0017 + grill Q9). Two managed systems whose
// default owner is the seeded mock-admin-1 actor; five analytics areas
// across them. teams seeded with zero rows per ADR-0018.
const SEED_MANAGED_SYSTEMS = [
  { slug: 'tableau', name: 'Tableau' },
  { slug: 'power-bi', name: 'Power BI' },
] as const;

const SEED_ANALYTICS_AREAS: ReadonlyArray<{
  msSlug: 'tableau' | 'power-bi';
  slug: string;
  name: string;
}> = [
  { msSlug: 'tableau', slug: 'permission-management', name: 'Permission Management' },
  { msSlug: 'tableau', slug: 'usage-analytics', name: 'Usage Analytics' },
  { msSlug: 'tableau', slug: 'dashboard-catalog', name: 'Dashboard Catalog' },
  { msSlug: 'power-bi', slug: 'permission-management', name: 'Permission Management' },
  { msSlug: 'power-bi', slug: 'usage-analytics', name: 'Usage Analytics' },
];

export interface SeedResult {
  workspaceId: string;
  workspaceInserted: boolean;
  actorsInserted: number;
  managedSystemsInserted: number;
  analyticsAreasInserted: number;
  vocsInserted: number;
  conversationRowsInserted: number;
  permissionFixturesInserted: number;
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
      .onConflictDoNothing({ target: [actors.workspaceId, actors.externalId] })
      .returning({ id: actors.id });
    if (rows.length > 0) actorsInserted += 1;
  }

  // ── Resolve mock-admin-1 for default_owner_actor_id ─────────────────
  const adminRows = await db
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.workspaceId, workspaceId), eq(actors.externalId, 'mock-admin-1')));
  const adminActorId = adminRows[0]?.id;
  if (!adminActorId) {
    throw new Error('Seed expected mock-admin-1 actor to exist after actor upsert.');
  }

  // ── Managed Systems upsert (ADR-0017) ───────────────────────────────
  // Idempotency: partial unique on (workspace_id, slug) WHERE archived_at
  // IS NULL forbids duplicate active rows. We pre-check existence rather
  // than rely on onConflictDoNothing because the index is partial.
  let managedSystemsInserted = 0;
  const msIdBySlug = new Map<string, string>();
  for (const m of SEED_MANAGED_SYSTEMS) {
    const existing = await db
      .select({ id: managedSystems.id })
      .from(managedSystems)
      .where(
        and(
          eq(managedSystems.workspaceId, workspaceId),
          eq(managedSystems.slug, m.slug),
          isNull(managedSystems.archivedAt),
        ),
      );
    let id = existing[0]?.id;
    if (!id) {
      const inserted = await db
        .insert(managedSystems)
        .values({
          workspaceId,
          slug: m.slug,
          name: m.name,
          defaultOwnerActorId: adminActorId,
        })
        .returning({ id: managedSystems.id });
      id = inserted[0]?.id;
      if (id) {
        managedSystemsInserted += 1;
      }
    }
    if (id) msIdBySlug.set(m.slug, id);
  }

  // ── Analytics Areas upsert (ADR-0017, grill Q9) ─────────────────────
  let analyticsAreasInserted = 0;
  for (const a of SEED_ANALYTICS_AREAS) {
    const msId = msIdBySlug.get(a.msSlug);
    if (!msId) continue;
    const existing = await db
      .select({ id: analyticsAreas.id })
      .from(analyticsAreas)
      .where(
        and(
          eq(analyticsAreas.workspaceId, workspaceId),
          eq(analyticsAreas.managedSystemId, msId),
          eq(analyticsAreas.slug, a.slug),
          isNull(analyticsAreas.archivedAt),
        ),
      );
    if (existing.length === 0) {
      await db.insert(analyticsAreas).values({
        workspaceId,
        managedSystemId: msId,
        slug: a.slug,
        name: a.name,
      });
      analyticsAreasInserted += 1;
    }
  }

  // ── Slice 3 VOC fixtures ────────────────────────────────────────────────
  // ensureSeedTeam must run BEFORE seedSlice3Vocs so the '[seed] VOC owner
  // team' row exists for VOC fixtures that use a team owner. Uses
  // fops_migrate role (DATABASE_URL_MIGRATE) because fops_app cannot INSERT
  // on core.teams per ADR-0019.
  if (!config.DATABASE_URL_MIGRATE) {
    throw new Error(
      'DATABASE_URL_MIGRATE is required for the Slice 3 seed (creates the ' +
      'fixture team that fops_app cannot insert per ADR-0019).',
    );
  }
  await ensureSeedTeam(workspaceId, config.DATABASE_URL_MIGRATE);
  const slice3 = await seedSlice3Vocs(handle, workspaceId);

  return {
    workspaceId,
    workspaceInserted,
    actorsInserted,
    managedSystemsInserted,
    analyticsAreasInserted,
    vocsInserted: slice3.vocsInserted,
    conversationRowsInserted: slice3.conversationRowsInserted,
    permissionFixturesInserted: slice3.permissionFixturesInserted,
  };
}

// ── CLI entry ─────────────────────────────────────────────────────────
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
