import { defineConfig } from 'drizzle-kit';

// Per ADR-0015: hand-reviewed SQL files; no `drizzle-kit push` outside local dev.
// Drizzle CLI must connect as fops_migrate (full DDL/DML), never as fops_app.
// DATABASE_URL_MIGRATE is the migration-only connection; DATABASE_URL is the
// runtime app connection (fops_app) and is intentionally NOT consulted here.
const migrateUrl =
  process.env.DATABASE_URL_MIGRATE ??
  'postgres://fops_migrate:fops_migrate@localhost:5432/feedbackops';

export default defineConfig({
  // drizzle-kit 0.30.1's CJS loader cannot resolve the `.js` specifiers
  // NodeNext requires for cross-file `.ts` imports (issue #422), so `schema`
  // points at the pre-bundled CJS file produced by scripts/bundle-schema.mjs
  // (run automatically by `db:generate`). Bundle drizzle-orm externals resolve
  // from apps/backend/node_modules as usual.
  schema: './.drizzle-schema/schema.cjs',
  // The drift gate (scripts/gates/db-migration-drift-gate.mjs) redirects this
  // to a throwaway copy of migrations via DRIZZLE_OUT: drizzle-kit's CLI
  // `--out` flag bypasses this config file entirely (schema/dialect drop to
  // undefined), so the env var is the only way to reuse the real config.
  out: process.env.DRIZZLE_OUT ?? './migrations',
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
