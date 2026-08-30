#!/usr/bin/env node
// Verifies the committed Drizzle migration history without applying migrations.
// `drizzle-kit check` (pinned at 0.30.1) checks migration files/snapshots on disk;
// it does not connect to a database. Supply a deliberately unreachable URL when
// none is configured so a future CLI behavior change cannot select the dev DB.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

checkRegistration();
checkDrizzleHistory();
