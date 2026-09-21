// Unit tests for the runtime DB role guard (#402) against a fake pool.
//
// The guard must key off the CONNECTED role (current_user) reported by
// Postgres, never off the URL text: wrong role name, any of the five
// privilege-escalation attributes, or an empty pg_roles lookup all fail with
// actionable messages that contain no connection URL.

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { assertRuntimeDbRole } from '../runtime-role.js';

interface RoleRow {
  name: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolbypassrls: boolean;
  rolreplication: boolean;
}

function safeRow(name = 'fops_app'): RoleRow {
  return {
    name,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolbypassrls: false,
    rolreplication: false,
  };
}

function fakePool(rows: RoleRow[]): { pool: Pick<pg.Pool, 'query'>; queryTexts: string[] } {
  const queryTexts: string[] = [];
  const pool = {
    query: (async (queryText: string) => {
      queryTexts.push(queryText);
      return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
    }) as pg.Pool['query'],
  };
  return { pool, queryTexts };
}

describe('assertRuntimeDbRole', () => {
  it('passes for fops_app with all unsafe attributes false', async () => {
    const { pool, queryTexts } = fakePool([safeRow()]);
    await expect(assertRuntimeDbRole(pool)).resolves.toBeUndefined();
    // The guard must ask Postgres who the session is, not parse the URL.
    expect(queryTexts[0]).toContain('current_user');
    expect(queryTexts[0]).toContain('pg_roles');
  });

  it('rejects a different role name, naming it and no URL', async () => {
    const { pool } = fakePool([safeRow('fops_migrate')]);
    const err = await assertRuntimeDbRole(pool).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('fops_migrate');
    expect(err?.message).toContain('fops_app');
    expect(err?.message).toMatch(/DATABASE_URL_MIGRATE only for migrations\/seeds/);
    expect(err?.message).not.toMatch(/postgres:|:\/\//);
  });

  it.each([
    ['rolsuper', 'superuser'],
    ['rolcreaterole', 'createrole'],
    ['rolcreatedb', 'createdb'],
    ['rolbypassrls', 'bypassrls'],
    ['rolreplication', 'replication'],
  ])('rejects fops_app with %s set', async (column, attribute) => {
    const row = { ...safeRow(), [column]: true };
    const { pool } = fakePool([row]);
    await expect(assertRuntimeDbRole(pool)).rejects.toThrow(
      `role fops_app has unsafe attribute ${attribute}`,
    );
  });

  it('rejects when pg_roles returns zero rows', async () => {
    const { pool } = fakePool([]);
    await expect(assertRuntimeDbRole(pool)).rejects.toThrow(/no pg_roles entry/);
  });
});
