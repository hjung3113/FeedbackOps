// Integration tests for ADR-0008 role separation.
//
// Requires a running Postgres with both fops_app and fops_migrate roles, the
// Slice 1 migration applied, and the baseline seed in place. The repo ships
// docker-compose.dev.yml for exactly this purpose:
//
//   docker compose -f docker-compose.dev.yml up -d
//   export DATABASE_URL_MIGRATE='postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops'
//   export DATABASE_URL='postgres://fops_app:fops_app@localhost:5434/feedbackops'
//   export WORKSPACE_ID='11111111-1111-1111-1111-111111111111'
//   pnpm --filter @fops/backend db:migrate
//   pnpm --filter @fops/backend db:seed
//   pnpm --filter @fops/backend test
//
// When DATABASE_URL is not set, the suite is skipped — unit-level tests still
// run on machines without Docker.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';

const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('ADR-0008 role separation', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;

  beforeAll(() => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
  });

  afterAll(async () => {
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('fops_app may INSERT into core.audit_log', async () => {
    const systemActor = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'system' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    expect(systemActor.rows.length).toBe(1);

    const result = await appHandle.pool.query(
      `insert into core.audit_log
         (workspace_id, actor_id, event_type, subject_type, subject_id, summary)
       values ($1, $2, 'test.app_insert', 'workspace', $1, 'role-grant test')
       returning id`,
      [WORKSPACE_ID, systemActor.rows[0]?.id],
    );
    expect(result.rowCount).toBe(1);
  });

  it('fops_app must NOT UPDATE core.audit_log', async () => {
    await expect(
      appHandle.pool.query(
        `update core.audit_log set summary = 'tampered' where event_type = 'test.app_insert'`,
      ),
    ).rejects.toMatchObject({ code: '42501' }); // insufficient_privilege
  });

  it('fops_app must NOT DELETE from core.audit_log', async () => {
    await expect(
      appHandle.pool.query(`delete from core.audit_log where event_type = 'test.app_insert'`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('fops_app may UPDATE core.workspaces (non-audit tables stay writable)', async () => {
    const before = await appHandle.pool.query<{ name: string }>(
      'select name from core.workspaces where id = $1',
      [WORKSPACE_ID],
    );
    expect(before.rows.length).toBe(1);
    const originalName = before.rows[0]?.name;

    const result = await appHandle.pool.query(
      'update core.workspaces set name = $2 where id = $1',
      [WORKSPACE_ID, `${originalName}__rolegrant_test`],
    );
    expect(result.rowCount).toBe(1);

    // Restore so the seed-idempotency test stays clean.
    await appHandle.pool.query('update core.workspaces set name = $2 where id = $1', [
      WORKSPACE_ID,
      originalName,
    ]);
  });

  it('fops_app has full DML on Slice 2 registry tables (managed_systems, analytics_areas)', async () => {
    // ADR-0008 + ADR-0017 role grants: app role can SELECT/INSERT/
    // UPDATE/DELETE the registry tables that Slice 2 services write to.
    for (const fq of ['core.managed_systems', 'core.analytics_areas']) {
      const [schema, table] = fq.split('.');
      const { rows } = await appHandle.pool.query<{ privilege_type: string }>(
        `select privilege_type from information_schema.role_table_grants
          where grantee = 'fops_app' and table_schema = $1 and table_name = $2`,
        [schema, table],
      );
      const got = new Set(rows.map((r) => r.privilege_type));
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(got.has(p), `${fq} missing ${p} for fops_app`).toBe(true);
      }
    }
  });

  it('fops_app has SELECT-only on core.teams (ADR-0019 Section C / review DB-003)', async () => {
    // The placeholder narrative in ADR-0018 says no Slice 2 service writes
    // to core.teams. Migration 0009 revokes INSERT/UPDATE/DELETE so the
    // grant matches the service surface. The team CRUD slice restores the
    // write grants in its own migration alongside the management service.
    const { rows } = await appHandle.pool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'fops_app' and table_schema = 'core' and table_name = 'teams'`,
    );
    const got = new Set(rows.map((r) => r.privilege_type));
    expect(got.has('SELECT')).toBe(true);
    for (const p of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(got.has(p), `core.teams should not grant ${p} to fops_app post-0009`).toBe(false);
    }
  });

  it('fops_app must NOT EXECUTE pgboss._create_queue_unsafe (raw DDL-capable function)', async () => {
    // F-010 follow-up: migration 0007 renamed the raw function to
    // `_create_queue_unsafe` and revoked EXECUTE from fops_app + PUBLIC.
    // Only fops_migrate (owner) can call it directly.
    const { rows } = await appHandle.pool.query<{ has: boolean }>(
      "select has_function_privilege('fops_app', 'pgboss._create_queue_unsafe(text, jsonb)', 'execute') as has",
    );
    expect(rows[0]?.has).toBe(false);
  });

  it('fops_app may EXECUTE the pgboss.create_queue SECURITY DEFINER shim', async () => {
    const { rows } = await appHandle.pool.query<{ has: boolean }>(
      "select has_function_privilege('fops_app', 'pgboss.create_queue(text, jsonb)', 'execute') as has",
    );
    expect(rows[0]?.has).toBe(true);
  });

  it('pgboss.create_queue rejects partition := true when called from fops_app', async () => {
    // The shim hard-rejects partition-true requests so a future pg-boss
    // upgrade (or app-side mistake) cannot trigger DDL through fops_app's
    // SECURITY DEFINER elevation.
    await expect(
      appHandle.pool.query(
        "select pgboss.create_queue($1, '{\"partition\":true}'::jsonb)",
        ['__f010_test_partitioned__'],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('pgboss.create_queue rejects adjacent truthy partition variants (review C3 + DB-006)', async () => {
    // The 0008 strict-guard rewrite normalizes via lower() and matches
    // any of {'true','t','1'}. These three payloads must all reject; the
    // case-folded key variant passes through (no partition matched) and
    // is handled by the regular boot path with policy validation.
    for (const payload of [
      '{"partition":"True"}', // upper-case T
      '{"partition":"TRUE"}', // all caps
      '{"partition":1}', // numeric truthy
    ]) {
      await expect(
        appHandle.pool.query(
          `select pgboss.create_queue($1, '${payload}'::jsonb)`,
          [`__f010_test_variant_${payload}__`],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('pgboss.create_queue accepts a valid partition=false call (review L1 happy-path direct)', async () => {
    // Boot integration tests exercise this transitively, but a direct
    // call catches an EXECUTE grant regression in milliseconds. Use
    // fops_migrate to clean up since pgboss.delete_queue EXECUTE was
    // revoked from fops_app in migration 0003.
    const queueName = `__f010_test_ok_${Date.now()}__`;
    await appHandle.pool.query(
      `select pgboss.create_queue($1, '{"partition":false,"policy":"standard"}'::jsonb)`,
      [queueName],
    );
    await migrateHandle.pool.query('delete from pgboss.queue where name = $1', [queueName]);
  });

  it('Slice 2 review DB-001/002: FK columns on Slice 2 tables have supporting indexes', async () => {
    // Every FK column added by Slice 2 #9 + 0006 needs its own index per
    // ADR-0015:57 unless a covering composite already exists. The
    // existing `analytics_areas_workspace_managed_system_idx` (0005:135)
    // covers `analytics_areas.managed_system_id`; the rest are explicit
    // in 0008. Assert each named index exists.
    const expected = [
      'managed_systems_workspace_default_owner_actor_idx',
      'managed_systems_workspace_default_owner_team_idx',
      'managed_systems_workspace_archived_by_idx',
      'analytics_areas_workspace_owner_team_idx',
      'analytics_areas_workspace_archived_by_idx',
      'teams_workspace_archived_by_idx',
      'permission_grants_workspace_managed_system_idx',
      'permission_denies_workspace_managed_system_idx',
      'permission_requests_workspace_requested_managed_system_idx',
    ];
    const { rows } = await migrateHandle.pool.query<{ indexname: string }>(
      `select indexname from pg_indexes where indexname = ANY($1::text[])`,
      [expected],
    );
    const got = new Set(rows.map((r) => r.indexname));
    for (const name of expected) {
      expect(got.has(name), `index ${name} missing`).toBe(true);
    }
  });

  it('Slice 2 review DB-004: pg-boss create_queue functions owned by fops_migrate', async () => {
    // SECURITY DEFINER on pgboss.create_queue runs with the owner's
    // privileges. ADR-0008 requires the DDL-capable owner; pin it.
    const { rows } = await migrateHandle.pool.query<{
      proname: string;
      rolname: string;
    }>(
      `select p.proname, r.rolname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_roles r on r.oid = p.proowner
        where n.nspname = 'pgboss'
          and p.proname in ('create_queue', '_create_queue_unsafe')`,
    );
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.rolname).toBe('fops_migrate');
    }
  });

  it('fops_migrate retains UPDATE on core.audit_log (operator escape hatch)', async () => {
    const result = await migrateHandle.pool.query(
      `update core.audit_log set summary = summary where event_type = 'test.app_insert'`,
    );
    expect(result.rowCount).toBeGreaterThan(0);

    // Operator cleanup: delete the rows the previous test inserted so reruns
    // start clean. ADR-0008 acknowledges fops_migrate is the only mutator.
    await migrateHandle.pool.query(
      `delete from core.audit_log where event_type = 'test.app_insert'`,
    );
  });
});

describe.skipIf(!runIntegration)('Index conventions (ADR-0015:55-61)', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(MIGRATE_URL);
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('every workspace-scoped index starts with workspace_id', async () => {
    // Inspect index definitions for the Slice 1 tables and assert that
    // workspace_id is the first column of every index whose name signals a
    // workspace-scoped read path.
    // Restrict to tables that actually carry workspace_id. core.idempotency_keys
    // and core.sessions's PK index are intentionally keyed differently per
    // ADR-0015:80-87 / ADR-0006:26-38 and have their own composite PK that is
    // not workspace-first.
    const { rows } = await handle.pool.query<{
      schemaname: string;
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(
      `with workspace_scoped as (
         select c.table_schema, c.table_name
           from information_schema.columns c
          where c.column_name = 'workspace_id'
            and c.table_schema in ('core','permission')
       )
       select i.schemaname, i.tablename, i.indexname, i.indexdef
         from pg_indexes i
         join workspace_scoped w
           on w.table_schema = i.schemaname and w.table_name = i.tablename
        where i.indexdef ~ 'btree'`,
    );
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      // Skip primary-key indexes on workspace-scoped tables: the PK is the
      // surrogate `id`, not the tenant column. ADR-0015 governs read-path
      // indexes; primary keys are excluded explicitly.
      if (r.indexname.endsWith('_pk') || r.indexname.endsWith('_pkey')) continue;
      // Skip the `sessions` PK as well — its PK is the opaque session id
      // text column (ADR-0006).
      if (r.indexname === 'sessions_pkey') continue;

      const cols = r.indexdef.match(/\((.*)\)/)?.[1] ?? '';
      const firstCol = cols.split(',')[0]?.trim().replace(/"/g, '');
      expect(firstCol, `${r.schemaname}.${r.tablename}.${r.indexname} indexdef=${r.indexdef}`).toBe(
        'workspace_id',
      );
    }
  });
});
