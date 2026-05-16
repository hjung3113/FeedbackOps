// Integration tests for Slice 2 #9 schema (ADR-0017 + ADR-0018).
//
// Verifies the load-bearing constraints on managed_systems / analytics_areas
// / teams: FK targets, the default-owner XOR CHECK, partial unique indexes
// (active rows only — slug reusable after archive), and the new permission
// → managed_systems FKs added in migration 0006.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(MIGRATE_URL && WORKSPACE_ID);

const BOGUS_UUID = '00000000-0000-0000-0000-000000000099';

describe.skipIf(!runIntegration)('Slice 2 schema invariants', () => {
  let handle: DbHandle;
  let adminActorId: string;

  beforeAll(async () => {
    handle = createDb(MIGRATE_URL);
    const { rows } = await handle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = rows[0]?.id ?? '';
    expect(adminActorId).not.toBe('');
  });

  afterAll(async () => {
    await handle?.close();
  });

  // Each test cleans up its own rows; ms slugs are namespaced per test.
  beforeEach(async () => {
    await handle.pool.query(`delete from core.analytics_areas where slug like 'test-%'`);
    await handle.pool.query(`delete from core.managed_systems where slug like 'test-%'`);
    await handle.pool.query(`delete from core.teams where name like 'test-%'`);
  });

  it('managed_systems rejects rows that set BOTH default_owner_actor_id AND default_owner_team_id', async () => {
    const team = await handle.pool.query<{ id: string }>(
      `insert into core.teams (workspace_id, name) values ($1, 'test-xor-team') returning id`,
      [WORKSPACE_ID],
    );
    const teamId = team.rows[0]?.id;
    await expect(
      handle.pool.query(
        `insert into core.managed_systems
           (workspace_id, slug, name, default_owner_actor_id, default_owner_team_id)
         values ($1, 'test-xor', 'Test XOR', $2, $3)`,
        [WORKSPACE_ID, adminActorId, teamId],
      ),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });

  it('managed_systems accepts default_owner_actor_id only, default_owner_team_id only, or neither', async () => {
    const ok1 = await handle.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name, default_owner_actor_id)
         values ($1, 'test-xor-actor', 'a', $2)`,
      [WORKSPACE_ID, adminActorId],
    );
    expect(ok1.rowCount).toBe(1);

    const team = await handle.pool.query<{ id: string }>(
      `insert into core.teams (workspace_id, name) values ($1, 'test-xor-team2') returning id`,
      [WORKSPACE_ID],
    );
    const ok2 = await handle.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name, default_owner_team_id)
         values ($1, 'test-xor-team-only', 'b', $2)`,
      [WORKSPACE_ID, team.rows[0]?.id],
    );
    expect(ok2.rowCount).toBe(1);

    const ok3 = await handle.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name)
         values ($1, 'test-xor-none', 'c')`,
      [WORKSPACE_ID],
    );
    expect(ok3.rowCount).toBe(1);
  });

  it('managed_systems (workspace_id, slug) is unique only for non-archived rows; slug reusable after archive', async () => {
    await handle.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'test-reuse', 'first')`,
      [WORKSPACE_ID],
    );
    // Duplicate active slug rejected.
    await expect(
      handle.pool.query(
        `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'test-reuse', 'dup')`,
        [WORKSPACE_ID],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    // Archive the first row, then re-insert with the same slug.
    await handle.pool.query(
      `update core.managed_systems
         set archived_at = now(), archived_by_actor_id = $2
       where workspace_id = $1 and slug = 'test-reuse'`,
      [WORKSPACE_ID, adminActorId],
    );
    const reuse = await handle.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'test-reuse', 'second')`,
      [WORKSPACE_ID],
    );
    expect(reuse.rowCount).toBe(1);
  });

  it('analytics_areas (workspace_id, managed_system_id, slug) partial unique; same slug under different MS coexists', async () => {
    const ms1 = await handle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'test-ms1', 'm1') returning id`,
      [WORKSPACE_ID],
    );
    const ms2 = await handle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, 'test-ms2', 'm2') returning id`,
      [WORKSPACE_ID],
    );
    const ms1Id = ms1.rows[0]?.id;
    const ms2Id = ms2.rows[0]?.id;

    await handle.pool.query(
      `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
         values ($1, $2, 'test-permission-management', 'pm')`,
      [WORKSPACE_ID, ms1Id],
    );
    // Same slug under ms2 → OK.
    const cross = await handle.pool.query(
      `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
         values ($1, $2, 'test-permission-management', 'pm2')`,
      [WORKSPACE_ID, ms2Id],
    );
    expect(cross.rowCount).toBe(1);
    // Duplicate under same ms → reject.
    await expect(
      handle.pool.query(
        `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
           values ($1, $2, 'test-permission-management', 'pm-dup')`,
        [WORKSPACE_ID, ms1Id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('analytics_areas.managed_system_id FK rejects unknown managed system', async () => {
    await expect(
      handle.pool.query(
        `insert into core.analytics_areas (workspace_id, managed_system_id, slug, name)
           values ($1, $2, 'test-fk-aa', 'x')`,
        [WORKSPACE_ID, BOGUS_UUID],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('permission_grants.managed_system_id FK to managed_systems rejects unknown MS', async () => {
    await expect(
      handle.pool.query(
        `insert into permission.permission_grants
           (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, 'voc.read', $3, $2)`,
        [WORKSPACE_ID, adminActorId, BOGUS_UUID],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('permission_denies.managed_system_id FK rejects unknown MS', async () => {
    await expect(
      handle.pool.query(
        `insert into permission.permission_denies
           (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
         values ($1, $2, 'voc.read', $3, 'test', $2)`,
        [WORKSPACE_ID, adminActorId, BOGUS_UUID],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('permission_requests.requested_managed_system_id FK rejects unknown MS', async () => {
    await expect(
      handle.pool.query(
        `insert into permission.permission_requests
           (workspace_id, requester_actor_id, requested_capability, requested_managed_system_id, reason, status)
         values ($1, $2, 'voc.read', $3, 'test', 'pending')`,
        [WORKSPACE_ID, adminActorId, BOGUS_UUID],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
