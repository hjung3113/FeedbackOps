// Runtime boot guard for the `node dist/index` entry (issue #402, ADR-0008).
//
// The running app must connect as the plain `fops_app` DML role. Instead of
// trusting the DATABASE_URL text, this guard asks Postgres who the connection
// is actually authenticated as (`current_user`) and inspects that role's
// attributes in pg_roles, so a misconfigured or swapped URL fails at boot
// rather than at the first privilege error.
//
// Scope: called only from src/index.ts. Migration/seed CLIs (drizzle-kit,
// src/seed/*) connect as fops_migrate via DATABASE_URL_MIGRATE and must NOT
// pass through this guard. buildServer and tests are unaffected.

import type pg from 'pg';

const RUNTIME_ROLE = 'fops_app';

// pg_roles attributes that would let the runtime role escalate past its
// DML-only grant set. Checked individually so the error names the offender.
const UNSAFE_ATTRIBUTES: ReadonlyArray<[column: string, attribute: string]> = [
  ['rolsuper', 'superuser'],
  ['rolcreaterole', 'createrole'],
  ['rolcreatedb', 'createdb'],
  ['rolbypassrls', 'bypassrls'],
  ['rolreplication', 'replication'],
];

interface ConnectedRoleRow {
  name: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolbypassrls: boolean;
  rolreplication: boolean;
}

// Messages never include the connection URL or credentials — only the role
// name Postgres reports for the connection.
export async function assertRuntimeDbRole(pool: Pick<pg.Pool, 'query'>): Promise<void> {
  const { rows } = await pool.query<ConnectedRoleRow>(
    // Identity check on the CONNECTED role: current_user is fixed per session
    // at authentication time and cannot be changed without a new session.
    'select current_user as name, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication from pg_roles r where r.rolname = current_user',
  );
  const [role] = rows;
  if (!role) {
    throw new Error(
      `runtime DATABASE_URL must connect as ${RUNTIME_ROLE}, but the connected role has no pg_roles entry; use DATABASE_URL_MIGRATE only for migrations/seeds`,
    );
  }
  if (role.name !== RUNTIME_ROLE) {
    throw new Error(
      `runtime DATABASE_URL must connect as ${RUNTIME_ROLE} (got "${role.name}"); use DATABASE_URL_MIGRATE only for migrations/seeds`,
    );
  }
  for (const [column, attribute] of UNSAFE_ATTRIBUTES) {
    if (role[column as keyof ConnectedRoleRow]) {
      throw new Error(`role ${RUNTIME_ROLE} has unsafe attribute ${attribute}`);
    }
  }
}
