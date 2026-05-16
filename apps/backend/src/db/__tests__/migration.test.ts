// Unit-level migration sanity. Runs without Postgres.
//
// Verifies:
//   * exactly one migration file currently exists under apps/backend/migrations,
//     so `drizzle-kit generate` has not produced a stray follow-up diff that a
//     reviewer might miss.
//   * that the generated SQL file contains the load-bearing role-separation
//     statements ADR-0008 requires (GRANT/REVOKE on core.audit_log) so a
//     careless future hand-edit cannot silently drop them.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');

describe('migrations directory', () => {
  it('has exactly one .sql migration in Slice 1', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toHaveLength(1);
  });

  it('Slice 1 migration encodes audit_log role grants per ADR-0008', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const firstFile = files[0];
    expect(firstFile).toBeDefined();
    if (!firstFile) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, firstFile), 'utf8');

    // ADR-0008: fops_app gets INSERT+SELECT only on core.audit_log;
    // UPDATE/DELETE/TRUNCATE are revoked.
    expect(sql).toMatch(/GRANT\s+SELECT,\s*INSERT\s+ON\s+"core"\."audit_log"\s+TO\s+fops_app/i);
    expect(sql).toMatch(
      /REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+"core"\."audit_log"\s+FROM\s+fops_app/i,
    );

    // fops_migrate retains ALL on every core/permission table.
    expect(sql).toMatch(/GRANT ALL ON ALL TABLES IN SCHEMA "core" TO fops_migrate/);
    expect(sql).toMatch(/GRANT ALL ON ALL TABLES IN SCHEMA "permission" TO fops_migrate/);

    // Non-audit tables: app role gets full DML.
    for (const tbl of [
      '"core"."workspaces"',
      '"core"."actors"',
      '"core"."sessions"',
      '"core"."idempotency_keys"',
      '"permission"."permission_grants"',
      '"permission"."permission_denies"',
      '"permission"."permission_requests"',
    ]) {
      const re = new RegExp(
        `GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+${tbl.replace(/\./g, '\\.').replace(/"/g, '"')}\\s+TO\\s+fops_app`,
        'i',
      );
      expect(sql).toMatch(re);
    }
  });

  it('Slice 1 migration encodes partial unique indexes per grill Q5/Q7', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const firstFile = files[0];
    expect(firstFile).toBeDefined();
    if (!firstFile) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, firstFile), 'utf8');

    // permission_grants_active_uq must include managed_system_id, object_type,
    // object_id under COALESCE, and the predicate must not reference now().
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "permission_grants_active_uq"[\s\S]*coalesce\("managed_system_id"[\s\S]*coalesce\("object_type"[\s\S]*coalesce\("object_id"[\s\S]*WHERE "revoked_at" is null/,
    );
    // Predicate must NOT reference now() / expires_at (now() is not IMMUTABLE
    // — Postgres rejects it inside partial-index predicates).
    const grantsIdxBlock = sql.match(
      /CREATE UNIQUE INDEX "permission_grants_active_uq"[\s\S]*?WHERE[^;]*;/,
    );
    expect(grantsIdxBlock).not.toBeNull();
    expect(grantsIdxBlock?.[0]).not.toMatch(/now\(\)/i);
    expect(grantsIdxBlock?.[0]).not.toMatch(/expires_at/i);

    // permission_requests_active_uq covers requester + capability + scope +
    // source tuple, scoped to pending/needs_more_info.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "permission_requests_active_uq"[\s\S]*coalesce\("source_object_type"[\s\S]*WHERE "status" in \('pending','needs_more_info'\)/,
    );
  });
});
