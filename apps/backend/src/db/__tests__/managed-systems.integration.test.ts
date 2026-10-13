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

  it('56-D reviewer pair allows null and rejects simultaneous Actor/team', async () => {
    const team = await handle.pool.query<{ id: string }>(
      "insert into core.teams (workspace_id, name) values ($1, 'test-reviewer-team') returning id",
      [WORKSPACE_ID],
    );
    const historical = await handle.pool.query(
      `select default_reviewer_actor_id, default_reviewer_team_id
      from core.managed_systems where workspace_id = $1 and slug in ('tableau','power-bi')`,
      [WORKSPACE_ID],
    );
    expect(historical.rowCount).toBeGreaterThan(0);
    for (const row of historical.rows)
      expect(row).toEqual({ default_reviewer_actor_id: null, default_reviewer_team_id: null });
    await expect(
      handle.pool.query(
        `insert into core.managed_systems
      (workspace_id, slug, name, default_reviewer_actor_id, default_reviewer_team_id)
      values ($1, 'test-reviewer-xor', 'Reviewer', $2, $3)`,
        [WORKSPACE_ID, adminActorId, team.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([
    ['finding', 'findings', 'owner_actor_id', 'owner_team_id'],
    ['task_request', 'task_requests', 'assigned_reviewer_actor_id', 'assigned_reviewer_team_id'],
    ['task', 'tasks', 'assignee_actor_id', 'assignee_team_id'],
  ])(
    '56-D %s responsibility columns are nullable with XOR and no historical backfill',
    async (schema, table, actorColumn, teamColumn) => {
      const columns = await handle.pool.query(
        `select column_name, is_nullable from information_schema.columns
      where table_schema = $1 and table_name = $2 and column_name = any($3::text[])`,
        [schema, table, [actorColumn, teamColumn]],
      );
      expect(columns.rows).toHaveLength(2);
      expect(columns.rows.every((row) => row.is_nullable === 'YES')).toBe(true);
      const constraints = await handle.pool.query(
        `select pg_get_constraintdef(c.oid) as definition from pg_constraint c
      join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = $1 and t.relname = $2 and c.contype = 'c'`,
        [schema, table],
      );
      expect(
        constraints.rows.some(
          (row) => row.definition.includes(actorColumn) && row.definition.includes(teamColumn),
        ),
      ).toBe(true);
      const rows = await handle.pool.query(
        `select count(*)::int as count from "${schema}"."${table}" where "${teamColumn}" is not null`,
      );
      expect(rows.rows[0]?.count).toBe(0);
    },
  );

  it('56-D source XOR constraints reject mixed responsibility and preserve decision/provenance', async () => {
    const client = await handle.pool.connect();
    await client.query('begin');
    try {
      const system = await client.query<{ id: string }>(
        "select id from core.managed_systems where workspace_id = $1 and slug = 'tableau' and archived_at is null",
        [WORKSPACE_ID],
      );
      expect(system.rowCount).toBe(1);
      const systemId = system.rows[0]?.id;
      const team = await client.query<{ id: string }>(
        "insert into core.teams (workspace_id, name) values ($1, 'test-source-xor') returning id",
        [WORKSPACE_ID],
      );
      const teamId = team.rows[0]?.id;
      const finding = await client.query<{ id: string }>(
        `insert into finding.findings
        (workspace_id, display_id, primary_managed_system_id, title, summary, source_type, severity, created_by)
        values ($1, 'FND-56D-SCHEMA', $2, 'Schema', 'Schema', 'manual', 'medium', $3) returning id`,
        [WORKSPACE_ID, systemId, adminActorId],
      );
      const request = await client.query<{ id: string }>(
        `insert into task_request.task_requests
        (workspace_id, display_id, source_type, source_id, primary_managed_system_id, evidence_summary, requested_outcome,
          requester_actor_id, status, reviewer_actor_id, decision_reason, decided_at)
        values ($1, 'TR-56D-SCHEMA', 'finding', $2, $3, 'Schema', 'Schema', $4, 'approved', $4, 'Actual decision', '2026-10-01T00:00:00Z') returning id`,
        [WORKSPACE_ID, finding.rows[0]?.id, systemId, adminActorId],
      );
      const task = await client.query<{ id: string }>(
        `insert into task.tasks
        (workspace_id, display_id, primary_managed_system_id, title, assignee_actor_id, created_by)
        values ($1, 'TASK-56D-SCHEMA', $2, 'Schema', $3, $3) returning id`,
        [WORKSPACE_ID, systemId, adminActorId],
      );
      for (const [table, actorColumn, teamColumn, id] of [
        ['finding.findings', 'owner_actor_id', 'owner_team_id', finding.rows[0]?.id],
        [
          'task_request.task_requests',
          'assigned_reviewer_actor_id',
          'assigned_reviewer_team_id',
          request.rows[0]?.id,
        ],
        ['task.tasks', 'assignee_actor_id', 'assignee_team_id', task.rows[0]?.id],
      ]) {
        await client.query('savepoint mixed_pair');
        await expect(
          client.query(
            `update ${table} set ${actorColumn} = $2, ${teamColumn} = $3 where id = $1`,
            [id, adminActorId, teamId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await client.query('rollback to savepoint mixed_pair');
        await client.query(
          `update ${table} set ${actorColumn} = null, ${teamColumn} = $2 where id = $1`,
          [id, teamId],
        );
      }
      const decision = await client.query(
        `select reviewer_actor_id, decision_reason, decided_at,
        assigned_reviewer_actor_id, assigned_reviewer_team_id from task_request.task_requests where id = $1`,
        [request.rows[0]?.id],
      );
      expect(decision.rows[0]).toEqual({
        reviewer_actor_id: adminActorId,
        decision_reason: 'Actual decision',
        decided_at: new Date('2026-10-01T00:00:00Z'),
        assigned_reviewer_actor_id: null,
        assigned_reviewer_team_id: teamId,
      });
      const provenance = await client.query(
        'select created_by from finding.findings where id = $1',
        [finding.rows[0]?.id],
      );
      expect(provenance.rows[0]?.created_by).toBe(adminActorId);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
