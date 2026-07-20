import { defineConfig } from 'drizzle-kit';

// Per ADR-0015: hand-reviewed SQL files; no `drizzle-kit push` outside local dev.
// Drizzle CLI must connect as fops_migrate (full DDL/DML), never as fops_app.
// DATABASE_URL_MIGRATE is the migration-only connection; DATABASE_URL is the
// runtime app connection (fops_app) and is intentionally NOT consulted here.
const migrateUrl =
  process.env.DATABASE_URL_MIGRATE ??
  'postgres://fops_migrate:fops_migrate@localhost:5432/feedbackops';

export default defineConfig({
  // Point at the per-namespace files directly so drizzle-kit's CJS loader
  // doesn't hit ESM .js suffixes used by NodeNext at runtime.
  schema: [
    './src/db/schema/core.ts',
    './src/db/schema/permission.ts',
    './src/db/schema/voc.ts',
    './src/db/schema/voc-cluster.ts',
    './src/db/schema/finding.ts',
    './src/db/schema/task.ts',
    './src/db/schema/task-request.ts',
    './src/db/schema/survey.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: [
    'core',
    'permission',
    'voc',
    'voc_cluster',
    'finding',
    'task',
    'task_request',
    'survey',
  ],
  dbCredentials: {
    url: migrateUrl,
  },
  strict: true,
  verbose: true,
});
