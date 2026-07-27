// The one suite in this repo that must NOT be gated on the integration env.
//
// Every other integration suite uses `describe.skipIf(!runIntegration)`, so a
// run with no env exported reports green while 90 suites silently skipped and
// no database was touched (#204). This file inverts that: without the env, the
// default gate fails and names the command that actually runs the integration
// path.
//
// Escape hatch: `ALLOW_SKIPPED_INTEGRATION=1` for machines with no Postgres.
// It is deliberately explicit — the point is that skipping is a decision
// someone made, not a default nobody noticed.

import { describe, expect, it } from 'vitest';

const REQUIRED_ENV = ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID'] as const;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
const optedOut = process.env.ALLOW_SKIPPED_INTEGRATION === '1';

describe('integration gate (#204)', () => {
  it('runs the integration suites, or opts out on purpose', () => {
    if (optedOut) {
      console.warn(
        '[integration-gate] ALLOW_SKIPPED_INTEGRATION=1 — the 90 integration ' +
          'suites are skipped and no database was exercised. This run proves ' +
          'nothing about the integration path.',
      );
      return;
    }

    expect(
      missing,
      [
        '',
        'The integration suites are gated on env and none of them ran, so a green',
        'result here would cover only the unit path.',
        '',
        `Unset: ${missing.join(', ')}`,
        '',
        'Run the integration gate instead (loads .env, resets the database, re-seeds):',
        '  pnpm --filter backend test:integration',
        '',
        'Or, if this machine has no Postgres, opt out explicitly:',
        '  ALLOW_SKIPPED_INTEGRATION=1 pnpm --filter backend test',
        '',
      ].join('\n'),
    ).toEqual([]);
  });
});
