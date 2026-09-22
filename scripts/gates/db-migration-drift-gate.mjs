#!/usr/bin/env node
// Verifies the committed Drizzle migration history without applying migrations.
// `drizzle-kit check` (pinned at 0.30.1) checks migration files/snapshots on disk;
// it does not connect to a database. Supply a deliberately unreachable URL when
// none is configured so a future CLI behavior change cannot select the dev DB.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const gateDir = dirname(fileURLToPath(import.meta.url));
const root = join(gateDir, '..', '..');
const migrationsDir = join(root, 'apps', 'backend', 'migrations');
const journalPath = join(migrationsDir, 'meta', '_journal.json');

function printList(label, values) {
  if (values.length === 0) return;
  console.error(`migration drift: ${label}:`);
  for (const value of values) console.error(`  ${value}`);
}

function failRegistration(message) {
  console.error(`migration drift: ${message}`);
  process.exit(1);
}

function readJournalTags() {
  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  } catch (error) {
    failRegistration(`could not read ${journalPath}: ${error.message}`);
  }
  if (!Array.isArray(journal.entries)) {
    failRegistration(`${journalPath} must contain an entries array`);
  }

  const tags = [];
  for (const [index, entry] of journal.entries.entries()) {
    if (!entry || typeof entry.tag !== 'string' || entry.tag.length === 0) {
      failRegistration(`${journalPath} entry ${index} has no tag`);
    }
    tags.push(entry.tag);
  }
  return tags;
}

function checkRegistration() {
  const journalTags = readJournalTags();
  const sqlTags = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name.slice(0, -'.sql'.length));
  const duplicateJournalTags = journalTags.filter(
    (tag, index) => journalTags.indexOf(tag) !== index,
  );
  const journalSet = new Set(journalTags);
  const sqlSet = new Set(sqlTags);
  const unregisteredSql = sqlTags.filter((tag) => !journalSet.has(tag)).sort();
  const missingSql = journalTags.filter((tag) => !sqlSet.has(tag)).sort();
  console.error(
    `migration registration: ${sqlTags.length} SQL files, ${journalTags.length} journal entries`,
  );
  printList('SQL files missing journal registration', unregisteredSql);
  printList('journal entries missing SQL files', missingSql);
  printList('duplicate journal tags', [...new Set(duplicateJournalTags)].sort());
  if (unregisteredSql.length || missingSql.length || duplicateJournalTags.length) {
    process.exit(1);
  }
  console.error('migration registration: consistent');
}

function checkDrizzleHistory() {
  // Always override DATABASE_URL_MIGRATE with an unreachable URL, even when
  // the calling shell/CI has a real one set — this gate must never be able
  // to reach a live database (dev or otherwise), regardless of environment.
  const safeMigrateUrl = 'postgres://fops_migrate@127.0.0.1:1/drizzle_gate_no_database';
  console.error(
    'migration drift: forcing DATABASE_URL_MIGRATE to an unreachable URL for drizzle-kit check',
  );
  const run = spawnSync('pnpm', ['--filter', 'backend', 'db:check'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL_MIGRATE: safeMigrateUrl,
    },
  });
  if (run.error) {
    console.error(`migration drift: could not run drizzle-kit check: ${run.error.message}`);
    process.exit(2);
  }
  if (run.status !== 0) {
    console.error(`migration drift: drizzle-kit check failed (exit ${run.status ?? 'unknown'})`);
    process.exit(run.status ?? 1);
  }
  console.error('migration drift: drizzle-kit check passed');
}

function listFilesRelative(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFilesRelative(join(dir, entry.name), relativePath));
    else files.push(relativePath);
  }
  return files.sort();
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// `drizzle-kit check` cannot detect schema-vs-migration drift (it only
// validates journal/snapshot bookkeeping), so diff the live TS schema against
// the committed migrations here: copy the committed migrations to a throwaway
// directory and run `drizzle-kit generate --out` against the copy. If generate
// would emit any new or rewritten SQL/journal/snapshot file, the schema has
// drifted from the committed migration history and this gate fails. The repo's
// own migrations directory is never written: generate only ever sees the
// throwaway copy. Like checkDrizzleHistory, the URL is forced unreachable so
// no step of this gate can ever touch a live database.
function checkSchemaDrift() {
  const safeMigrateUrl = 'postgres://fops_migrate@127.0.0.1:1/drizzle_gate_no_database';
  const scratchDir = mkdtempSync(join(tmpdir(), 'db-migration-drift-gate-'));
  const scratchOut = join(scratchDir, 'migrations');
  // process.exit() below skips `finally`, so clean up from an exit hook too
  // (it also runs on process.exit) — a failing gate must not leak scratch dirs.
  process.on('exit', () => rmSync(scratchDir, { recursive: true, force: true }));
  cpSync(migrationsDir, scratchOut, { recursive: true });
  console.error(
    'migration drift: running db:generate against a throwaway copy of the committed migrations',
  );
  try {
    // drizzle-kit 0.30.1 can log an exception and still exit 0 (e.g. missing
    // snapshot files), which would make the file comparison below pass
    // vacuously. Capture the output, echo it, and require a completion marker
    // before trusting the comparison.
    const run = spawnSync(
      'pnpm',
      ['--filter', 'backend', 'db:generate'],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL_MIGRATE: safeMigrateUrl,
          // drizzle-kit resolves a config-supplied `out` against the config
          // dir and mangles absolute paths ("./" + path), so hand it a
          // "./"-relative path from apps/backend into the throwaway copy.
          DRIZZLE_OUT: `./${relative(join(root, 'apps', 'backend'), scratchOut)}`,
        },
      },
    );
    if (run.error) {
      console.error(`migration drift: could not run db:generate: ${run.error.message}`);
      process.exit(2);
    }
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.status !== 0) {
      console.error(`migration drift: db:generate failed (exit ${run.status ?? 'unknown'})`);
      process.exit(run.status ?? 1);
    }
    const completed =
      run.stdout?.includes('No schema changes') ||
      run.stdout?.includes('Your SQL migration file');
    if (!completed) {
      console.error(
        'migration drift: db:generate produced no completion marker — cannot assess drift',
      );
      process.exit(2);
    }

    const committedFiles = listFilesRelative(migrationsDir);
    const generatedFiles = listFilesRelative(scratchOut);
    const committedSet = new Set(committedFiles);
    const newFiles = generatedFiles.filter((file) => !committedSet.has(file));
    const rewrittenFiles = committedFiles.filter(
      (file) =>
        generatedFiles.includes(file) &&
        sha256File(join(migrationsDir, file)) !== sha256File(join(scratchOut, file)),
    );
    printList('generate would add (schema drift)', newFiles.map((file) => relative(root, join(scratchOut, file))));
    printList(
      'generate would rewrite (schema drift)',
      rewrittenFiles.map((file) => relative(root, join(migrationsDir, file))),
    );
    if (newFiles.length || rewrittenFiles.length) {
      // Diagnostic context: drizzle diffs the live schema against the NEWEST
      // snapshot under migrations/meta (index-named, e.g. 0047_snapshot.json);
      // intermediate journal entries do not need their own. If the newest
      // journal entry has no snapshot (a hand-written migration landed without
      // regenerating it), the diff runs from a stale base and flags the
      // metadata gap on top of any genuine drift.
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      const snapshotFileFor = (tag) => `meta/${tag.split('_')[0]}_snapshot.json`;
      const latest = journal.entries.at(-1);
      if (latest && !committedSet.has(snapshotFileFor(latest.tag))) {
        console.error(
          `migration drift: newest journal entry ${latest.tag} has no meta snapshot ` +
            `(${snapshotFileFor(latest.tag)}); drizzle-kit generate would diff against a stale ` +
            'base. Regenerate it: run `pnpm --filter backend db:generate`, keep only the new ' +
            `meta snapshot renamed to ${snapshotFileFor(latest.tag)}, and discard the generated SQL/journal change.`,
        );
      }
      process.exit(1);
    }
    console.error('migration drift: generate emitted nothing new — schema matches migrations');
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

checkRegistration();
checkDrizzleHistory();
checkSchemaDrift();
