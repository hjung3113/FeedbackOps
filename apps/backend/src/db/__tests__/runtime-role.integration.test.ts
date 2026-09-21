// Integration tests for the runtime DB role guard (#402).
//
// Requires a running Postgres with both fops_app and fops_migrate roles and
// the Slice 1 migration applied (see role-grants.integration.test.ts for the
// full docker-compose/pnpm recipe). The guard resolves for the DATABASE_URL
// (fops_app) connection and rejects for the DATABASE_URL_MIGRATE (fops_migrate)
// connection. When the integration env is not exported, the suite is skipped —
// unit-level tests still run on machines without Docker.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';
import { assertRuntimeDbRole } from '../runtime-role.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';

const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('runtime DB role guard (#402)', () => {
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

  it('resolves when connected as fops_app (DATABASE_URL)', async () => {
    await expect(assertRuntimeDbRole(appHandle.pool)).resolves.toBeUndefined();
  });

  it('rejects when connected as fops_migrate (DATABASE_URL_MIGRATE)', async () => {
    const err = await assertRuntimeDbRole(migrateHandle.pool).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('fops_migrate');
    expect(err?.message).toMatch(/must connect as fops_app \(got "fops_migrate"\)/);
  });
});
