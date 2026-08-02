// Integration contract for the optional black-box persona seed layer.
//
// This suite starts from the global setup's core seed, proves core remains
// persona-free, then layers personas over it. It intentionally uses the
// permission decision service instead of treating grant rows as access proof.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCheckService } from '../../modules/permissions/check-service.js';
import { runSeed } from '../../seed/index.js';
import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const PERSONA_ACTORS = [
  {
    external_id: 'mock-admin-2',
    display_name: 'Mock Admin Two',
    role_level: 'admin',
    actor_type: 'internal_member',
    email: 'admin2@feedbackops.local',
  },
  {
    external_id: 'mock-user-2',
    display_name: 'Mock User Two',
    role_level: 'user',
    actor_type: 'internal_member',
    email: 'user2@feedbackops.local',
  },
  {
    external_id: 'mock-developer-1',
    display_name: 'Mock Developer One',
    role_level: 'developer',
    actor_type: 'internal_member',
    email: 'dev1@feedbackops.local',
  },
  {
    external_id: 'mock-developer-2',
    display_name: 'Mock Developer Two',
    role_level: 'developer',
    actor_type: 'internal_member',
    email: 'dev2@feedbackops.local',
  },
] as const;

const PERSONA_GRANT_EXTERNAL_IDS = PERSONA_ACTORS.map((actor) => actor.external_id);

// The two human actors the *core* seed owns. Asserted by name so a core-seed
// regression still fails loudly.
const CORE_SEED_ACTORS = [
  {
    external_id: 'mock-admin-1',
    display_name: 'Mock Admin',
    role_level: 'admin',
    actor_type: 'internal_member',
    email: 'admin@feedbackops.local',
  },
  {
    external_id: 'mock-user-1',
    display_name: 'Mock User',
    role_level: 'user',
    actor_type: 'internal_member',
    email: 'user@feedbackops.local',
  },
] as const;

const SEED_OWNED_EXTERNAL_IDS: readonly string[] = [
  ...CORE_SEED_ACTORS.map((actor) => actor.external_id),
  ...PERSONA_GRANT_EXTERNAL_IDS,
];

type HumanActorRow = {
  external_id: string;
  display_name: string;
  role_level: string;
  actor_type: string;
  email: string;
};

// Every non-system actor in the workspace, ordered by external_id.
//
// This table is SHARED: other integration files insert their own actors and
// (by design — see the rate-limit case in post-reporter-reply) do not remove
// them. So this suite must never assert an exact set over the whole table; it
// asserts over the set *difference* it causes. See #304.
async function readHumanActors(handle: DbHandle): Promise<HumanActorRow[]> {
  const { rows } = await handle.pool.query<HumanActorRow>(
    `select external_id, display_name, role_level, actor_type, email
       from core.actors
      where workspace_id = $1
        and actor_type <> 'system'
      order by external_id`,
    [WORKSPACE_ID],
  );
  return rows;
}

async function runWithSeedMode<T>(mode: 'core' | 'personas', action: () => Promise<T>): Promise<T> {
  const previous = process.env.SEED_MODE;
  process.env.SEED_MODE = mode;
  try {
    return await action();
  } finally {
    // Reflect.deleteProperty rather than `delete` — process.env treats an
    // assigned `undefined` as the string "undefined", so the key must go.
    if (previous === undefined) Reflect.deleteProperty(process.env, 'SEED_MODE');
    else process.env.SEED_MODE = previous;
  }
}

describe.skipIf(!runIntegration)('persona seed layer', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(APP_URL);
  });
  afterAll(async () => {
    await handle?.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
             where workspace_id = $1
               and external_id = any($2::text[])
          )`,
      [WORKSPACE_ID, PERSONA_GRANT_EXTERNAL_IDS],
    );
    await handle?.pool.query(
      `delete from core.actors
        where workspace_id = $1
          and external_id = any($2::text[])`,
      [WORKSPACE_ID, PERSONA_ACTORS.map((actor) => actor.external_id)],
    );
    await handle?.close();
  });

  it('keeps core seed persona-free, then adds exactly the four persona actors', async () => {
    await runWithSeedMode('core', () => runSeed(handle));

    const beforeActors = await readHumanActors(handle);

    // Core seed owns exactly these two, and no persona.
    expect(
      beforeActors.filter((actor) => SEED_OWNED_EXTERNAL_IDS.includes(actor.external_id)),
      `seed-owned actors after the core seed: ${beforeActors
        .filter((actor) => SEED_OWNED_EXTERNAL_IDS.includes(actor.external_id))
        .map((actor) => actor.external_id)
        .join(', ')}`,
    ).toEqual([...CORE_SEED_ACTORS]);

    const beforeGrants = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from permission.permission_grants g
         join core.actors a on a.id = g.actor_id
        where g.workspace_id = $1
          and a.external_id = any($2::text[])`,
      [WORKSPACE_ID, PERSONA_GRANT_EXTERNAL_IDS],
    );
    expect(beforeGrants.rows[0]?.count).toBe('0');

    const result = await runWithSeedMode('personas', () => runSeed(handle));

    const afterActors = await readHumanActors(handle);
    const beforeExternalIds = new Set(beforeActors.map((actor) => actor.external_id));

    // What the persona seed added — set difference, not an exact set over a
    // table other suites also write to.
    const added = afterActors.filter((actor) => !beforeExternalIds.has(actor.external_id));
    expect(
      added,
      `persona seed added: ${added.map((actor) => actor.external_id).join(', ') || '(nothing)'}`,
    ).toEqual([PERSONA_ACTORS[0], PERSONA_ACTORS[2], PERSONA_ACTORS[3], PERSONA_ACTORS[1]]);

    // ...and it changed or removed nothing that was already there.
    expect(afterActors.filter((actor) => beforeExternalIds.has(actor.external_id))).toEqual(
      beforeActors,
    );

    // Counts last: the set assertions above name the offending actor, these
    // only report an arity.
    expect(result.personaActorsInserted).toBe(4);
    expect(result.personaGrantsInserted).toBe(13);
  });

  it('is idempotent and keeps developer Managed System scopes disjoint', async () => {
    const beforeGrantCount = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from permission.permission_grants g
         join core.actors a on a.id = g.actor_id
        where g.workspace_id = $1
          and a.external_id = any($2::text[])`,
      [WORKSPACE_ID, PERSONA_GRANT_EXTERNAL_IDS],
    );
    const result = await runWithSeedMode('personas', () => runSeed(handle));
    expect(result.personaActorsInserted).toBe(0);
    expect(result.personaGrantsInserted).toBe(0);

    const afterGrantCount = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from permission.permission_grants g
         join core.actors a on a.id = g.actor_id
        where g.workspace_id = $1
          and a.external_id = any($2::text[])`,
      [WORKSPACE_ID, PERSONA_GRANT_EXTERNAL_IDS],
    );
    expect(afterGrantCount.rows[0]?.count).toBe(beforeGrantCount.rows[0]?.count);

    const { rows } = await handle.pool.query<{
      external_id: string;
      capability: string;
      managed_system_id: string | null;
      slug: string | null;
    }>(
      `select a.external_id, g.capability, g.managed_system_id, m.slug
         from permission.permission_grants g
         join core.actors a on a.id = g.actor_id
         left join core.managed_systems m on m.id = g.managed_system_id
        where g.workspace_id = $1
          and a.external_id in ('mock-developer-1', 'mock-developer-2')
        order by a.external_id, m.slug`,
      [WORKSPACE_ID],
    );
    const scopeByDeveloper = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.slug) continue;
      const scope = scopeByDeveloper.get(row.external_id) ?? new Set<string>();
      scope.add(row.slug);
      scopeByDeveloper.set(row.external_id, scope);
    }
    const developerOne = scopeByDeveloper.get('mock-developer-1') ?? new Set<string>();
    const developerTwo = scopeByDeveloper.get('mock-developer-2') ?? new Set<string>();
    const overlap = [...developerOne].filter((slug) => developerTwo.has(slug));
    expect(
      overlap,
      `Developer Managed System scope leaked: mock-developer-1=[${[...developerOne]}], mock-developer-2=[${[...developerTwo]}]`,
    ).toEqual([]);
    expect([...developerOne], `mock-developer-1 Managed Systems: ${[...developerOne]}`).toEqual([
      'tableau',
    ]);
    expect([...developerTwo], `mock-developer-2 Managed Systems: ${[...developerTwo]}`).toEqual([
      'power-bi',
    ]);

    const workspaceWide = rows
      .filter((row) => row.managed_system_id === null)
      .map(({ external_id, capability }) => ({ external_id, capability }));
    expect(workspaceWide, 'Only workspace.read may be workspace-wide for Developers.').toEqual([
      { external_id: 'mock-developer-1', capability: 'workspace.read' },
      { external_id: 'mock-developer-2', capability: 'workspace.read' },
    ]);
  });

  it('allows both persona admins for every seeded Managed System without grant rows', async () => {
    const { rows: adminGrants } = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from permission.permission_grants g
         join core.actors a on a.id = g.actor_id
        where g.workspace_id = $1
          and a.external_id in ('mock-admin-1', 'mock-admin-2')`,
      [WORKSPACE_ID],
    );
    expect(adminGrants[0]?.count).toBe('0');

    const { rows: actors } = await handle.pool.query<{
      actor_id: string;
      external_id: string;
      workspace_id: string;
      role_level: string;
    }>(
      `select id as actor_id, external_id, workspace_id, role_level
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-2', 'mock-admin-1')
        order by external_id`,
      [WORKSPACE_ID],
    );
    const { rows: systems } = await handle.pool.query<{ id: string; slug: string }>(
      `select id, slug from core.managed_systems
        where workspace_id = $1 and archived_at is null
        order by slug`,
      [WORKSPACE_ID],
    );
    const check = createCheckService({ db: handle.db });
    expect(actors.map((actor) => actor.external_id)).toEqual(['mock-admin-1', 'mock-admin-2']);

    for (const actor of actors) {
      for (const system of systems) {
        await expect(
          check.checkCapability(actor, 'voc.triage', {
            workspace_id: WORKSPACE_ID,
            managed_system_id: system.id,
          }),
          `${actor.external_id} must triage ${system.slug}`,
        ).resolves.toMatchObject({ allow: true });
        await expect(
          check.checkCapability(actor, 'workspace.admin', {
            workspace_id: WORKSPACE_ID,
            managed_system_id: system.id,
          }),
          `${actor.external_id} must administer ${system.slug}`,
        ).resolves.toMatchObject({ allow: true });
      }
    }
  });

  it('denies Developer capabilities outside their intentional allocation', async () => {
    const { rows: actors } = await handle.pool.query<{
      actor_id: string;
      external_id: string;
      workspace_id: string;
      role_level: string;
    }>(
      `select id as actor_id, external_id, workspace_id, role_level
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-developer-1', 'mock-developer-2')`,
      [WORKSPACE_ID],
    );
    const { rows: systems } = await handle.pool.query<{ id: string; slug: string }>(
      `select id, slug from core.managed_systems
        where workspace_id = $1 and archived_at is null
        order by slug`,
      [WORKSPACE_ID],
    );
    const actorByExternalId = new Map(actors.map((actor) => [actor.external_id, actor]));
    const check = createCheckService({ db: handle.db });
    const developerOne = actorByExternalId.get('mock-developer-1');
    const developerTwo = actorByExternalId.get('mock-developer-2');
    const powerBi = systems.find((system) => system.slug === 'power-bi');
    expect(developerOne).toBeDefined();
    expect(developerTwo).toBeDefined();
    expect(powerBi).toBeDefined();
    if (!developerOne || !developerTwo || !powerBi) {
      throw new Error('Persona seed did not provide both Developers and power-bi.');
    }

    await expect(
      check.checkCapability(developerOne, 'finding.read', {
        workspace_id: WORKSPACE_ID,
        managed_system_id: powerBi.id,
      }),
      'mock-developer-1 must not read Findings in power-bi',
    ).resolves.toMatchObject({ allow: false });
    for (const system of systems) {
      await expect(
        check.checkCapability(developerTwo, 'finding.manage', {
          workspace_id: WORKSPACE_ID,
          managed_system_id: system.id,
        }),
        `mock-developer-2 must not manage Findings in ${system.slug}`,
      ).resolves.toMatchObject({ allow: false });
    }
  });
});
