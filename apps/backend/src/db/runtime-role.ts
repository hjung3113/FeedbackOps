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
  session_name: string;
  privileged_member_of: string | null;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolbypassrls: boolean;
  rolreplication: boolean;
}

// Thrown for every guard rejection. index.ts prints only these messages;
// anything else (driver errors) is reported generically so a connection error
// can never echo a DSN.
export class RuntimeRoleError extends Error {
  override readonly name = 'RuntimeRoleError';
}

// Messages never include the connection URL or credentials — only the role
// names Postgres reports for the connection.
export async function assertRuntimeDbRole(pool: Pick<pg.Pool, 'query'>): Promise<void> {
  const { rows } = await pool.query<ConnectedRoleRow>(
    // Identity check on the CONNECTED role. current_user can be changed by
    // startup options / SET ROLE / a pooler's connect_query, so session_user
    // (the authenticated login) must match too, and the role must not be a
    // (transitive) member of a privileged role it could SET ROLE into.
    `select current_user as name, session_user as session_name,
            r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication,
            (select m.rolname from pg_roles m
              where m.rolname <> current_user
                and pg_has_role(current_user, m.oid, 'MEMBER')
                and (m.rolsuper or m.rolcreaterole or m.rolcreatedb or m.rolbypassrls
                     or m.rolreplication or m.rolname = 'fops_migrate')
              limit 1) as privileged_member_of
       from pg_roles r where r.rolname = current_user`,
  );
  const [role] = rows;
  if (!role) {
    throw new RuntimeRoleError(
      `runtime DATABASE_URL must connect as ${RUNTIME_ROLE}, but the connected role has no pg_roles entry; use DATABASE_URL_MIGRATE only for migrations/seeds`,
    );
  }
  if (role.name !== RUNTIME_ROLE) {
    throw new RuntimeRoleError(
      `runtime DATABASE_URL must connect as ${RUNTIME_ROLE} (got "${role.name}"); use DATABASE_URL_MIGRATE only for migrations/seeds`,
    );
  }
  if (role.session_name !== RUNTIME_ROLE) {
    throw new RuntimeRoleError(
      `runtime DATABASE_URL must authenticate as ${RUNTIME_ROLE} (session user is "${role.session_name}", acting as "${role.name}"); do not use SET ROLE, startup role options, or a pooler connect_query to assume it`,
    );
  }
  if (role.privileged_member_of) {
    throw new RuntimeRoleError(
      `role ${RUNTIME_ROLE} must not be a member of privileged role "${role.privileged_member_of}"`,
    );
  }
  for (const [column, attribute] of UNSAFE_ATTRIBUTES) {
    if (role[column as keyof ConnectedRoleRow]) {
      throw new RuntimeRoleError(`role ${RUNTIME_ROLE} has unsafe attribute ${attribute}`);
    }
  }
}
