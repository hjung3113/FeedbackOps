import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/backend/package.json'));
const { Client } = require('pg');
const journalPath = resolve(root, 'apps/backend/migrations/meta/_journal.json');

// This is the active managed-system projection in src/seed/index.ts. It is
// deliberately source-owned expected data; the database query below is the
// independent actual side and exposes leftover managed-system fixtures.
const seededManagedSystems = [
  { slug: 'power-bi', name: 'Power BI' },
  { slug: 'tableau', name: 'Tableau' },
];

function digest(records) {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

function databaseTarget(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

async function expectedMigrationHash() {
  // Expected migration records come from the on-disk journal and its SQL files.
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const records = await Promise.all(
    journal.entries.map(async ({ tag, when }) => ({
      createdAt: String(when),
      hash: createHash('sha256')
        .update(await readFile(resolve(root, `apps/backend/migrations/${tag}.sql`)))
        .digest('hex'),
    })),
  );
  return digest(
    records.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );
}

async function main() {
  const appUrl = process.env.VERIFY_DATABASE_URL ?? process.env.DATABASE_URL;
  const migrateUrl = process.env.VERIFY_DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL_MIGRATE;
  const workspaceId = process.env.WORKSPACE_ID;
  if (!appUrl || !migrateUrl || !workspaceId) {
    throw new Error('DATABASE_URL, DATABASE_URL_MIGRATE, and WORKSPACE_ID are required');
  }
  if (databaseTarget(appUrl) !== databaseTarget(migrateUrl)) {
    throw new Error('DATABASE_URL_MIGRATE must target the same database as DATABASE_URL');
  }

  const configuredRole = decodeURIComponent(new URL(appUrl).username);
  if (!configuredRole) throw new Error('DATABASE_URL must include a database role');

  const app = new Client({ connectionString: appUrl });
  const migrate = new Client({ connectionString: migrateUrl });
  await Promise.all([app.connect(), migrate.connect()]);
  try {
    const [roleResult, sentinelResult, migrationResult, expectedMigrations] = await Promise.all([
      app.query(
        `select current_user as name, r.rolsuper as superuser
           from pg_roles r
          where r.rolname = current_user`,
      ),
      app.query(
        `select slug, name
           from core.managed_systems
          where workspace_id = $1 and archived_at is null
          order by slug, name`,
        [workspaceId],
      ),
      migrate.query(
        // Actual migration records come from Drizzle's applied-migration ledger.
        `select created_at::text as "createdAt", hash
           from drizzle.__drizzle_migrations
          order by created_at, hash`,
      ),
      expectedMigrationHash(),
    ]);
    const role = roleResult.rows[0];
    if (!role || role.name !== configuredRole) {
      throw new Error('DATABASE_URL role does not match the connected database role');
    }

    const output = {
      role: { name: configuredRole, superuser: role.superuser },
      checks: [
        {
          code: 'sentinel',
          expected: digest(seededManagedSystems),
          // Actual sentinel records are the active managed systems in the seeded workspace.
          actual: digest(sentinelResult.rows),
        },
        {
          code: 'migration_hash',
          expected: expectedMigrations,
          actual: digest(migrationResult.rows),
        },
      ],
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    await Promise.all([app.end(), migrate.end()]);
  }
}

main().catch((error) => {
  console.error(`clean-state probe failed: ${error.message}`);
  process.exitCode = 1;
});
