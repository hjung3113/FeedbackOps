// Postgres client factory. Two flavours coexist in this codebase:
//   * the runtime app client, connecting as fops_app (DATABASE_URL).
//   * operator scripts (seed, migrate, tests of role separation) connecting as
//     fops_migrate via DATABASE_URL_MIGRATE.
//
// The factory takes the URL explicitly so callers can't accidentally pick up
// the wrong role from process.env.

import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as core from './schema/core.js';
import * as permission from './schema/permission.js';

const schema = { ...core, ...permission };

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(url: string): DbHandle {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

export type { DrizzleTx, Tx } from './tx.js';
