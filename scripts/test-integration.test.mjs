// Focused test for the dev-database guard in test-integration.sh: an env file whose
// DATABASE_URL or DATABASE_URL_MIGRATE targets port 5434 (the development database)
// is refused unless FEEDBACKOPS_ALLOW_DEV_DB=1. Every case stops before vitest:
// either at the guard or at the NODE_ENV=production refusal that follows it, so no
// database is ever reached.
// Run: node scripts/test-integration.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('test-integration.sh', import.meta.url));
const url = (role, port) => `postgres://${role}:${role}@localhost:${port}/feedbackops`;
const connectionUrl = (role, target) => (typeof target === 'number' ? url(role, target) : target);

const cases = [
  ['app URL on 5434', 5434, 5439, {}, 'refusing DATABASE_URL on port 5434'],
  ['migrate URL on 5434', 5439, 5434, {}, 'refusing DATABASE_URL_MIGRATE on port 5434'],
  ['5434 with the opt-in', 5434, 5434, { FEEDBACKOPS_ALLOW_DEV_DB: '1' }, 'NODE_ENV=production'],
  ['throwaway port', 5439, 5439, {}, 'NODE_ENV=production'],
];

const devTargets = [
  ['query overrides authority', 'postgres://u:p@localhost:5432/feedbackops?port=5434', {}],
  ['query without authority port', 'postgres://u:p@localhost/feedbackops?port=5434', {}],
  [
    'at sign in query',
    'postgres://u:p@localhost:5434/feedbackops?application_name=review@host',
    {},
  ],
  ['zero-padded port', 'postgres://u:p@localhost:05434/feedbackops', {}],
  ['PGPORT fallback', 'postgres://u:p@localhost/feedbackops', { PGPORT: '5434' }],
];
for (const variable of ['DATABASE_URL', 'DATABASE_URL_MIGRATE']) {
  for (const [shape, target, extraEnv] of devTargets) {
    for (const allow of [false, true]) {
      cases.push([
        `${variable}: ${shape}, opt-in=${allow}`,
        variable === 'DATABASE_URL' ? target : 5439,
        variable === 'DATABASE_URL_MIGRATE' ? target : 5439,
        { ...extraEnv, ...(allow ? { FEEDBACKOPS_ALLOW_DEV_DB: '1' } : {}) },
        allow ? 'NODE_ENV=production' : `refusing ${variable} on port 5434`,
      ]);
    }
  }
  for (const allow of [false, true]) {
    cases.push([
      `${variable}: invalid URL, opt-in=${allow}`,
      variable === 'DATABASE_URL' ? 'postgres://u:p@[invalid/feedbackops' : 5439,
      variable === 'DATABASE_URL_MIGRATE' ? 'postgres://u:p@[invalid/feedbackops' : 5439,
      allow ? { FEEDBACKOPS_ALLOW_DEV_DB: '1' } : {},
      `refusing ${variable}: cannot resolve PostgreSQL port`,
    ]);
  }
}
cases.push([
  'default port',
  'postgres://u:p@localhost/feedbackops',
  'postgres://u:p@localhost/feedbackops',
  {},
  'NODE_ENV=production',
]);
cases.push([
  'explicit 5439 overrides PGPORT',
  5439,
  5439,
  { PGPORT: '5434' },
  'NODE_ENV=production',
]);

const dir = mkdtempSync(join(tmpdir(), 'test-integration-guard-'));
let failures = 0;
try {
  for (const [name, appPort, migratePort, extraEnv, expected] of cases) {
    const envFile = join(dir, 'guard.env');
    writeFileSync(
      envFile,
      `DATABASE_URL=${connectionUrl('fops_app', appPort)}\nDATABASE_URL_MIGRATE=${connectionUrl('fops_migrate', migratePort)}\nWORKSPACE_ID=00000000-0000-0000-0000-000000000001\n`,
    );
    const { FEEDBACKOPS_ALLOW_DEV_DB: _inherited, PGPORT: _pgport, ...inherited } = process.env;
    const env = {
      ...inherited,
      FEEDBACKOPS_ENV_FILE: envFile,
      NODE_ENV: 'production',
      ...extraEnv,
    };
    const run = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
    try {
      assert.equal(run.status, 1, `${name}: exit`);
      assert.ok(run.stderr.includes(expected), `${name}: stderr names "${expected}"`);
      process.stdout.write(`ok - ${name}\n`);
    } catch (err) {
      failures += 1;
      console.error(`not ok - ${name}\n${err.message}\nstderr: ${run.stderr}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ntest-integration guard tests: OK\n');
