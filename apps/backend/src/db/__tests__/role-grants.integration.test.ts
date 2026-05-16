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
