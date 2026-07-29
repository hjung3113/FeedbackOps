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
  it('has at least the Slice 2 migrations applied (0000..0008)', () => {
    // The exact count grows with every Slice; pin only the floor so this
    // assertion does not block future migrations (test review H7). Per-file
    // content checks below are the load-bearing assertions.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files[0]).toMatch(/^0000_/);
    expect(files[7]).toMatch(/^0007_pgboss_create_queue_shim/);
    expect(files[8]).toMatch(/^0008_slice2_review_followups/);
    expect(files[9]).toMatch(/^0009_teams_grants_tighten/);
  });

  it('Slice 1 migration encodes audit_log role grants per ADR-0008', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
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
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
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

  it('Slice 1 #6 migration installs pg-boss schema with fops_app DML grant only', () => {
    // ADR-0009 + spec choice (A): the running app role must never DDL the
    // pgboss schema. Migration 0002 owns the install; fops_app gets DML +
    // EXECUTE on functions, fops_migrate gets everything.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const third = files[2];
    expect(third).toBeDefined();
    if (!third) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, third), 'utf8');
    expect(sql).toMatch(/CREATE SCHEMA IF NOT EXISTS pgboss/);
    expect(sql).toMatch(/CREATE TABLE pgboss\.version/);
    expect(sql).toMatch(/CREATE TABLE pgboss\.queue/);
    expect(sql).toMatch(/CREATE TABLE pgboss\.schedule/);
    expect(sql).toMatch(/CREATE TABLE pgboss\.job\b/);
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA pgboss TO fops_app/);
    expect(sql).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+ALL TABLES IN SCHEMA pgboss\s+TO\s+fops_app/i,
    );
    expect(sql).toMatch(/GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO fops_app/);
    expect(sql).toMatch(/GRANT ALL ON SCHEMA pgboss TO fops_migrate/);
  });

  it('Slice 1 #3 migration adds rate_limits with fops_app grant', () => {
    // The rate-limit backing table (ADR-0015:7-8) must be writable by the
    // app role — the plugin upserts per request. fops_migrate already has
    // ALL via the schema-level grant in migration 0000, so only the app
    // grant needs to be hand-added in 0001.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const second = files[1];
    expect(second).toBeDefined();
    if (!second) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, second), 'utf8');
    expect(sql).toMatch(/CREATE TABLE "core"\."rate_limits"/);
    expect(sql).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+"core"\."rate_limits"\s+TO\s+fops_app/i,
    );
  });

  it('Slice 2 #9 migration 0005 creates managed_systems + analytics_areas + teams', () => {
    // ADR-0017 + ADR-0018 lock the shape. Verify the load-bearing DDL is
    // present in the generated SQL so a careless rewrite cannot drop it
    // without the suite failing.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const fifth = files[5];
    expect(fifth).toBeDefined();
    if (!fifth) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, fifth), 'utf8');

    expect(sql).toMatch(/CREATE TABLE "core"\."managed_systems"/);
    expect(sql).toMatch(/CREATE TABLE "core"\."analytics_areas"/);
    expect(sql).toMatch(/CREATE TABLE "core"\."teams"/);

    // ADR-0018 default-owner XOR-or-both-null CHECK.
    expect(sql).toMatch(
      /CONSTRAINT "managed_systems_default_owner_xor_check"[\s\S]*"default_owner_actor_id" is null[\s\S]*"default_owner_team_id" is null/i,
    );

    // Partial unique indexes per ADR-0017 / ADR-0018.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "managed_systems_workspace_slug_active_uq"[\s\S]*\("workspace_id","slug"\)[\s\S]*WHERE "archived_at" is null/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "analytics_areas_workspace_ms_slug_active_uq"[\s\S]*\("workspace_id","managed_system_id","slug"\)[\s\S]*WHERE "archived_at" is null/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "teams_workspace_name_active_uq"[\s\S]*\("workspace_id","name"\)[\s\S]*WHERE "archived_at" is null/,
    );

    // FK targets: analytics_areas.managed_system_id → core.managed_systems(id).
    expect(sql).toMatch(
      /analytics_areas[\s\S]*FOREIGN KEY \("managed_system_id"\) REFERENCES "core"\."managed_systems"\("id"\)/,
    );

    // Role grants per ADR-0008 for all three new tables.
    for (const tbl of ['"core"."managed_systems"', '"core"."analytics_areas"', '"core"."teams"']) {
      const re = new RegExp(
        `GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE,\\s*DELETE\\s+ON\\s+${tbl.replace(/\./g, '\\.').replace(/"/g, '"')}\\s+TO\\s+fops_app`,
        'i',
      );
      expect(sql).toMatch(re);
    }
  });

  it('Slice 2 #8 migration 0007 installs SECURITY DEFINER shim for pgboss.create_queue', () => {
    // F-010 follow-up: the raw pg-boss create_queue function DDLs partition
    // tables when partition=true. The shim renames the original to
    // `_create_queue_unsafe`, revokes EXECUTE from fops_app + PUBLIC, and
    // re-creates `pgboss.create_queue` as a SECURITY DEFINER wrapper that
    // hard-rejects partition=true. fops_app gets EXECUTE on the wrapper
    // only.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const seventh = files[7];
    expect(seventh).toBeDefined();
    if (!seventh) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, seventh), 'utf8');

    expect(sql).toMatch(
      /ALTER FUNCTION pgboss\.create_queue\(text, jsonb\)[\s\S]*RENAME TO _create_queue_unsafe/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION pgboss\._create_queue_unsafe\(text, jsonb\) FROM fops_app/,
    );
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION pgboss\._create_queue_unsafe\(text, jsonb\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /CREATE FUNCTION pgboss\.create_queue\(queue_name text, options jsonb\)[\s\S]*SECURITY DEFINER/,
    );
    expect(sql).toMatch(/options->>'partition' = 'true'[\s\S]*RAISE EXCEPTION/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION pgboss\.create_queue\(text, jsonb\) TO fops_app/);
  });

  it('Slice 2 #8 review-followup migration 0008 adds FK indexes + symmetric grants + owner pin + strict shim guard', () => {
    // Review findings DB-001/002/004/005/006.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const eighth = files[8];
    expect(eighth).toBeDefined();
    if (!eighth) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, eighth), 'utf8');

    // DB-001 FK indexes on managed_systems / analytics_areas / teams.
    for (const idx of [
      'managed_systems_workspace_default_owner_actor_idx',
      'managed_systems_workspace_default_owner_team_idx',
      'managed_systems_workspace_archived_by_idx',
      'analytics_areas_workspace_owner_team_idx',
      'analytics_areas_workspace_archived_by_idx',
      'teams_workspace_archived_by_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX "${idx}"`));
    }

    // DB-002 FK indexes on permission tables → managed_systems.
    for (const idx of [
      'permission_grants_workspace_managed_system_idx',
      'permission_denies_workspace_managed_system_idx',
      'permission_requests_workspace_requested_managed_system_idx',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE INDEX "${idx}"`));
    }

    // DB-005 symmetric migrate grant on rate_limits.
    expect(sql).toMatch(/GRANT ALL ON "core"\."rate_limits" TO fops_migrate/);

    // DB-004 explicit ownership on the SECURITY DEFINER wrapper + raw fn.
    expect(sql).toMatch(/ALTER FUNCTION pgboss\.create_queue\(text, jsonb\) OWNER TO fops_migrate/);
    expect(sql).toMatch(
      /ALTER FUNCTION pgboss\._create_queue_unsafe\(text, jsonb\) OWNER TO fops_migrate/,
    );

    // DB-006 strict partition guard via lower() + IN.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION pgboss\.create_queue/);
    expect(sql).toMatch(/lower\(options->>'partition'\)/);
    expect(sql).toMatch(/IN \('true', 't', '1'\)/);
  });

  it('Slice 2 #9 migration 0006 adds permission → managed_systems FKs', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const sixth = files[6];
    expect(sixth).toBeDefined();
    if (!sixth) return;
    const sql = readFileSync(join(MIGRATIONS_DIR, sixth), 'utf8');

    expect(sql).toMatch(
      /"permission"\."permission_grants"[\s\S]*FOREIGN KEY \("managed_system_id"\) REFERENCES "core"\."managed_systems"\("id"\)/,
    );
    expect(sql).toMatch(
      /"permission"\."permission_denies"[\s\S]*FOREIGN KEY \("managed_system_id"\) REFERENCES "core"\."managed_systems"\("id"\)/,
    );
    expect(sql).toMatch(
      /"permission"\."permission_requests"[\s\S]*FOREIGN KEY \("requested_managed_system_id"\) REFERENCES "core"\."managed_systems"\("id"\)/,
    );
  });

  it('Slice 3 #34 migration switches VOC display ids to per-workspace counters', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '0017_voc_per_workspace_display_counter.sql'),
      'utf8',
    );

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "voc"\."workspace_display_counters"/i);
    expect(sql).toMatch(/"workspace_id"\s+uuid\s+PRIMARY KEY/i);
    expect(sql).toMatch(/"next_value"\s+bigint\s+NOT NULL\s+DEFAULT 1000/i);
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION "voc"\."next_voc_display_id"\(p_workspace_id uuid\)/i,
    );
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/ON CONFLICT \(workspace_id\) DO NOTHING/i);
    expect(sql).toMatch(/SET next_value = next_value \+ 1/i);
    expect(sql).toMatch(/RETURNING next_value - 1/i);

    const backfillBlock = sql.match(
      /INSERT INTO voc\.workspace_display_counters[\s\S]*?ON CONFLICT \(workspace_id\) DO UPDATE[\s\S]*?;/i,
    )?.[0];
    expect(backfillBlock).toBeDefined();
    expect(backfillBlock).toMatch(/regexp_replace\(v\.display_id, '\^VOC-'/i);
    expect(backfillBlock).toMatch(/v\.display_id ~ '\^VOC-\[0-9\]\+\$'/i);
    expect(backfillBlock).not.toMatch(/VOC-SEED/i);
    expect(backfillBlock).toMatch(/GREATEST\(\s*1000,[\s\S]*max\([\s\S]*\)\s*\+\s*1/i);

    expect(sql).toMatch(/DROP SEQUENCE IF EXISTS "voc"\."voc_display_seq"/i);
    expect(sql).toMatch(/GRANT SELECT ON "voc"\."workspace_display_counters" TO fops_app/i);
    expect(sql).not.toMatch(
      /GRANT\s+(?:SELECT,\s*)?INSERT[\s\S]*workspace_display_counters[\s\S]*TO fops_app/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+(?:SELECT,\s*)?UPDATE[\s\S]*workspace_display_counters[\s\S]*TO fops_app/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+(?:SELECT,\s*)?DELETE[\s\S]*workspace_display_counters[\s\S]*TO fops_app/i,
    );
  });
});

describe('migration journal', () => {
  it('keeps every migration file and journal entry in lockstep', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const tags = journal.entries.map((entry) => entry.tag);
    const tagSet = new Set(tags);
    const fileTags = files.map((file) => file.slice(0, -'.sql'.length));
    const fileTagSet = new Set(fileTags);
    const missingJournalEntries = files.filter((file) => !tagSet.has(file.slice(0, -'.sql'.length)));
    const missingMigrationFiles = tags.filter((tag) => !fileTagSet.has(tag));
    const unexpectedIndexes = journal.entries
      .filter((entry, expectedIdx) => entry.idx !== expectedIdx)
      .map((entry) => `${entry.idx}:${entry.tag}`);
    const mismatchedTags = journal.entries
      .filter((entry) => !entry.tag.startsWith(`${String(entry.idx).padStart(4, '0')}_`))
      .map((entry) => `${entry.idx}:${entry.tag}`);

    expect(files.length).toBeGreaterThanOrEqual(40);
    expect(journal.entries.length).toBe(files.length);
    expect(
      missingJournalEntries,
      `Migration file(s) missing _journal.json entry: ${missingJournalEntries.join(', ')}`,
    ).toEqual([]);
    expect(
      missingMigrationFiles,
      `_journal.json tag(s) missing migration file: ${missingMigrationFiles.join(', ')}`,
    ).toEqual([]);
    expect(
      unexpectedIndexes,
      `_journal.json entry idx values must be contiguous and ordered: ${unexpectedIndexes.join(', ')}`,
    ).toEqual([]);
    expect(
      mismatchedTags,
      `_journal.json tag(s) must start with their zero-padded idx: ${mismatchedTags.join(', ')}`,
    ).toEqual([]);
  });
});
